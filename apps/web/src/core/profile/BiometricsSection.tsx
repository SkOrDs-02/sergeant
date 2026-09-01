/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/**
 * Biometrics — hub-level form for the inputs Nutrition needs to run
 * the Mifflin-St Jeor BMR/TDEE estimate (height, birth-date, sex,
 * activity level, current weight). Lives on Profile so a user without
 * the Fizruk module still has a place to enter and edit them — see the
 * design discussion in `biometrics-storage-plan.md`.
 *
 * Weight in particular round-trips to Fizruk Body's `daily_log`
 * (`fizruk_daily_log_v1`): saving here writes today's entry, and a
 * Fizruk-side weigh-in updates the value displayed here. The dual-write
 * lives in `biometrics.ts` so this component only orchestrates the
 * form — no cross-module knowledge leaks into the JSX.
 */
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { DateField } from "@shared/components/ui/DateField";
import { normalizeAmountInput } from "@shared/lib/format/amount";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { Select } from "@shared/components/ui/Select";
import { Switch } from "@shared/components/ui/Switch";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { useDailyLog } from "../../modules/fizruk/hooks/useDailyLog";
import {
  ACTIVITY_LEVELS,
  HEIGHT_CM_RANGE,
  SEX_VALUES,
  WEIGHT_KG_RANGE,
  computeAgeYears,
  isBiometricsCompleteForTdee,
  type ActivityLevel,
  type Biometrics,
  type Sex,
} from "./biometrics";
import { useBiometrics } from "./useBiometrics";

const COPY = messages.biometrics;

const SEX_LABEL: Record<Sex, string> = {
  male: COPY.sexMale,
  female: COPY.sexFemale,
};

interface ActivityMeta {
  label: string;
  hint: string;
}

const ACTIVITY_META: Record<ActivityLevel, ActivityMeta> = {
  sedentary: {
    label: COPY.activitySedentaryLabel,
    hint: COPY.activitySedentaryHint,
  },
  light: {
    label: COPY.activityLightLabel,
    hint: COPY.activityLightHint,
  },
  moderate: {
    label: COPY.activityModerateLabel,
    hint: COPY.activityModerateHint,
  },
  active: {
    label: COPY.activityActiveLabel,
    hint: COPY.activityActiveHint,
  },
  very_active: {
    label: COPY.activityVeryActiveLabel,
    hint: COPY.activityVeryActiveHint,
  },
};

interface FormState {
  heightCm: string;
  birthDate: string;
  sex: Sex | "";
  activityLevel: ActivityLevel | "";
  weightKg: string;
  countWorkoutsInGoal: boolean;
}

function biometricsToForm(b: Biometrics): FormState {
  return {
    heightCm: b.heightCm == null ? "" : String(b.heightCm),
    birthDate: b.birthDate ?? "",
    sex: b.sex ?? "",
    activityLevel: b.activityLevel ?? "",
    weightKg: b.weightKg == null ? "" : String(b.weightKg),
    countWorkoutsInGoal: b.countWorkoutsInGoal,
  };
}

/**
 * `HEIGHT_CM_RANGE`/`WEIGHT_KG_RANGE` (imported from `./biometrics`) feed
 * BOTH the `<Input min max>` attributes below AND `BiometricsSchema`'s
 * bounds — one constant, not three copies (audit finding D5, see the
 * comment above their declaration in `biometrics.ts`). Browser `min`/`max`
 * are only a hint — paste or a programmatic submit bypasses them (the
 * same gate as `Measurements`) — so this is PII in a profile: out-of-range
 * input is rejected outright, never clamped. A guessed-for-the-user
 * height is worse than an error.
 *
 * L-4: "reject" means "don't patch this field" — not "treat as empty".
 * `parseInRangeOrNull` used to map invalid → `null` the same as an empty
 * field, so `diff` saw `null !== 175` and wiped the saved height instead
 * of just ignoring the bad input. See {@link parseRangedField}.
 */

/** Дата народження має власне вікно — жорстке вікно календаря (з 1970-го)
 *  відрізало б усіх, хто народився раніше. */
const BIRTH_DATE_MIN = "1900-01-01";

/**
 * Три стани замість колишнього `number | null` — L-4. `empty` (поле
 * порожнє) — навмисне очищення, дозволений `null`-патч. `invalid`
 * (сміття або поза `[min; max]`) — НЕ патчимо це поле взагалі, лише
 * показуємо помилку біля нього. `value` — валідне число, патчимо як є.
 * Раніше `empty` і `invalid` конфлювали в один `null`, тож diff не міг
 * відрізнити «користувач очистив поле» від «користувач ввів сміття» —
 * і трактував друге як перше, стираючи збережене значення.
 */
type RangedFieldParse =
  { kind: "empty" } | { kind: "invalid" } | { kind: "value"; value: number };

function parseRangedField(
  raw: string,
  { min, max }: { min: number; max: number },
): RangedFieldParse {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  const value = Number(normalizeAmountInput(trimmed));
  if (!Number.isFinite(value) || value < min || value > max) {
    return { kind: "invalid" };
  }
  return { kind: "value", value };
}

/**
 * Returns `null` when every form field matches its persisted source
 * (no dirty state). Otherwise returns the diff to feed into
 * `saveBiometrics`. Computed in a `useMemo` so the "Зберегти" button's
 * disabled state stays in lockstep with the form without a separate
 * `dirty` flag drifting out of sync.
 */
function diffFormAgainst(
  form: FormState,
  source: Biometrics,
):
  | (Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">> & {
      changed: true;
    })
  | null {
  const patch: Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">> = {};
  let changed = false;

  // L-4: `invalid` навмисно НЕ потрапляє у diff — це і є фікс. Раніше
  // out-of-range мапилось у `null`, `null !== 175` рахувалось за зміну,
  // і Save стирав збережений зріст. Тепер invalid просто не бере участі
  // в diff-порівнянні: ні зміни, ні патча, ні "dirty".
  const heightParsed = parseRangedField(form.heightCm, HEIGHT_CM_RANGE);
  if (heightParsed.kind !== "invalid") {
    const formHeight =
      heightParsed.kind === "value" ? heightParsed.value : null;
    if (formHeight !== source.heightCm) {
      patch.heightCm = formHeight;
      changed = true;
    }
  }

  const formBirthDate = form.birthDate.trim() === "" ? null : form.birthDate;
  if (formBirthDate !== source.birthDate) {
    patch.birthDate = formBirthDate;
    changed = true;
  }

  const formSex: Sex | null = form.sex === "" ? null : form.sex;
  if (formSex !== source.sex) {
    patch.sex = formSex;
    changed = true;
  }

  const formActivity: ActivityLevel | null =
    form.activityLevel === "" ? null : form.activityLevel;
  if (formActivity !== source.activityLevel) {
    patch.activityLevel = formActivity;
    changed = true;
  }

  const weightParsed = parseRangedField(form.weightKg, WEIGHT_KG_RANGE);
  if (weightParsed.kind !== "invalid") {
    const formWeight =
      weightParsed.kind === "value" ? weightParsed.value : null;
    if (formWeight !== source.weightKg) {
      patch.weightKg = formWeight;
      changed = true;
    }
  }

  if (form.countWorkoutsInGoal !== source.countWorkoutsInGoal) {
    patch.countWorkoutsInGoal = form.countWorkoutsInGoal;
    changed = true;
  }

  if (!changed) return null;
  return { ...patch, changed: true };
}

export interface BiometricsSectionProps {
  /**
   * Reflects the page-level "Офлайн" banner — biometrics is a pure
   * client-side store so editing works offline, but the disabled state
   * mirrors the rest of Profile for visual consistency.
   */
  online?: boolean;
}

export function BiometricsSection({ online = true }: BiometricsSectionProps) {
  const { biometrics, saveBiometrics } = useBiometrics();
  // Weight is the only field that round-trips to Fizruk Body — saving
  // a new value here logs a daily-log entry through the canonical
  // fizruk hook (which in turn calls `mirrorWeightToBiometrics` to
  // keep this section's snapshot in sync). Funnelling the cross-module
  // write through `useDailyLog` keeps the SQLite overlay (PR #030,
  // storage-roadmap) transparent — `biometrics.ts` no longer touches
  // `STORAGE_KEYS.FIZRUK_DAILY_LOG` directly.
  const { addEntry: addDailyLogEntry } = useDailyLog();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() =>
    biometricsToForm(biometrics),
  );
  const [prevBiometrics, setPrevBiometrics] = useState(biometrics);
  // D4 (adversarial review): чи вже "чіпав" (blur-нув) користувач це поле.
  // Гейтить лише ВІЗУАЛЬНИЙ показ помилки (див. `heightShowError` нижче) —
  // не саму валідацію: без гейту кожен проміжний символ мобільного набору
  // ("1" -> "17" -> "175") на секунду підсвічувався як невалідний,
  // `role="alert"` спрацьовував на кожен префікс, а для ваги помилка ще й
  // витісняла `weightSyncHint`, тож і текст, і `role` під полем мигали на
  // кожне натискання.
  const [heightTouched, setHeightTouched] = useState(false);
  const [weightTouched, setWeightTouched] = useState(false);
  if (biometrics !== prevBiometrics) {
    setPrevBiometrics(biometrics);
    setForm(biometricsToForm(biometrics));
    setHeightTouched(false);
    setWeightTouched(false);
  }

  const diff = useMemo(
    () => diffFormAgainst(form, biometrics),
    [form, biometrics],
  );

  // L-4: обчислюємо invalid незалежно від "dirty" — користувач мусить
  // бачити, ЧОМУ введене не приймається, навіть якщо через це саме поле
  // кнопка "Зберегти" лишається вимкненою (нема що патчити).
  const heightParsed = useMemo(
    () => parseRangedField(form.heightCm, HEIGHT_CM_RANGE),
    [form.heightCm],
  );
  const weightParsed = useMemo(
    () => parseRangedField(form.weightKg, WEIGHT_KG_RANGE),
    [form.weightKg],
  );
  const heightInvalid = heightParsed.kind === "invalid";
  const weightInvalid = weightParsed.kind === "invalid";
  // D4: показ (червона рамка + helper-text + role="alert") гейтиться
  // blur-ом; `heightInvalid`/`weightInvalid` самі лишаються live (не
  // гейтяться) — вони й далі керують Save-гейтом нижче (D1), бо
  // блокувати збереження треба навіть ДО того, як поле втратило фокус.
  const heightShowError = heightInvalid && heightTouched;
  const weightShowError = weightInvalid && weightTouched;

  // D1 (adversarial review, P1): раніше `dirty` (з `diff`) єдиний керував
  // Save-гейтом, а `diff` навмисно ІГНОРУЄ invalid-поля (L-4 вище). Тож
  // "є невалідне поле" саме по собі НЕ блокувало Save — блокувало лише
  // "нема жодної валідної зміни". Сценарій дефекту: збережено зріст 175;
  // юзер набирає 1750 (invalid, не патчиться) І міняє стать (valid, diff
  // непорожній) -> кнопка активна -> клік зберігає стать, зріст мовчки
  // відкидається, toast.success все одно "Збережено". Мінімум-фікс з
  // ревʼю: явно блокувати Save, доки БУДЬ-ЯКЕ поле invalid — replaced
  // "мовчки відкинуто" на "видимо заблоковано", а не намагаємось описати
  // часткове збереження в тості.
  const hasInvalidField = heightInvalid || weightInvalid;
  const dirty = diff !== null && !hasInvalidField;

  const ageYears = useMemo(
    () => computeAgeYears(biometrics.birthDate),
    [biometrics.birthDate],
  );
  const tdeeReady = isBiometricsCompleteForTdee(biometrics);

  const handleSave = () => {
    if (!diff) return;
    // `weightKg` НЕ виймаємо з `rest`: `hasOwnProperty` — рантайм-перевірка,
    // яку TS не вміє звужувати, тож зібраний назад патч мав тип
    // `number | null | undefined` і під `exactOptionalPropertyTypes: true`
    // не проходив у `saveBiometrics`. Лишаючи ключ у `rest`, ми зберігаємо
    // рівно ту саму семантику («вага їде в патч тоді й лише тоді, коли вона
    // була в diff»), але без ручного перезбирання обʼєкта і без ризику
    // підсунути `undefined` замість «не чіпати поле».
    const { changed: _changed, ...rest } = diff;
    void _changed;
    const weightInPatch = Object.prototype.hasOwnProperty.call(
      diff,
      "weightKg",
    );
    const weightKg = diff.weightKg;
    // D7 (adversarial review, P3): `writeBiometricsPatch` НЕ ідемпотентний
    // — щоразу, коли `weightKg` присутній у патчі, він перебиває
    // `weightUpdatedAt` СВОЇМ "зараз" (`biometrics.ts`, `writeBiometricsPatch`).
    // Коли вагу вже задзеркалено нижче через `addDailyLogEntry` (той самий
    // писач, що й будь-яке інше зважування — `recordBodyWeight`),
    // `weightUpdatedAt` МАЄ дорівнювати часу цього запису в журналі — його
    // як `at` сідованого заміру читає `bodyWeightBootstrap.ts`. Тому
    // `weightKg` явно виключається з другого (нижче) патча саме в цьому
    // випадку — інакше `saveBiometrics` переписав би LWW-маркер часом
    // кліку по «Зберегти», а не часом самого зважування.
    const mirroredWeight = weightInPatch && weightKg != null;
    const { weightKg: _mirroredWeightKg, ...nonWeightRest } = rest;
    void _mirroredWeightKg;
    const savePatch = mirroredWeight ? nonWeightRest : rest;
    try {
      // Weight first: addEntry mirrors back into biometrics with its
      // own `at` timestamp, so we want that write to land before the
      // non-weight save. When the user clears the weight to `null` we
      // still want the rest of the form to persist, but we don't write
      // a `null` daily-log entry (Profile "clear" is a snapshot edit,
      // not a journal deletion) — that path keeps `weightKg: null` in
      // `savePatch` (see `mirroredWeight` above) so `saveBiometrics`
      // still bumps `weightUpdatedAt` for the explicit clear.
      if (mirroredWeight) {
        addDailyLogEntry({ weightKg: weightKg as number });
      }
      // L-17: `saveBiometrics` кличеться БЕЗУМОВНО, доки є валідний
      // `diff` — навіть коли `savePatch` порожній (тільки-вага-змінилась
      // кейс, D8) — бо саме тут (`useBiometrics.ts`) живе write-through у
      // `pushBiometricsToServer`. Раніше стояв гейт
      // `if (Object.keys(rest).length > 0)`, який після появи `changed`-
      // деструктуризації був мертвим кодом (`rest` завжди мав хоч один
      // ключ, доки diff не null) — тепер, коли `savePatch` дійсно може
      // стати порожнім через виключення вище, той самий гейт зробив би
      // регресію: локально-порожній патч усе одно мусить дійти до пуша
      // на сервер, інакше "змінили тільки вагу" знов ніколи не пушиться.
      saveBiometrics(savePatch);
      toast.success(COPY.saveSuccess);
    } catch {
      // Значення лишились у полях форми, тож повтор шле рівно те саме.
      toast.error(COPY.saveError, undefined, {
        label: "Повторити",
        onClick: () => void handleSave(),
      });
    }
  };

  const editingDisabled = !online;

  return (
    <Card
      radius="lg"
      padding="none"
      className="min-w-0 max-w-full overflow-hidden"
    >
      {/* V-4 (2026-08-08) — той самий фікс, що й `MemoryBankSection.tsx`
          (канонічний коментар там): `COPY.sectionTitle` тут дослівно
          збігався з зовнішнім заголовком «Біометрія» в `ProfilePage.tsx`
          і малювався `text-style-label`, більшим за `xs`-кікер
          `CollapsibleSection`. Прибрано; іконка й статус готовності TDEE
          (мета-інформація) лишились. */}
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="activity" size={18} className="text-muted" />
        <span className="ml-auto text-style-caption text-muted">
          {tdeeReady ? COPY.statusReady : COPY.statusIncomplete}
        </span>
      </div>

      <div className="divide-y divide-line/60">
        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-height"
            className="text-style-caption block text-muted"
          >
            {COPY.heightLabel}
          </label>
          <Input
            id="biometrics-height"
            type="number"
            inputMode="numeric"
            min={HEIGHT_CM_RANGE.min}
            max={HEIGHT_CM_RANGE.max}
            step={1}
            value={form.heightCm}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, heightCm: e.target.value }))
            }
            onBlur={() => setHeightTouched(true)}
            placeholder="175"
            disabled={editingDisabled}
            className="min-w-0 max-w-full"
            error={heightShowError}
            helperText={heightShowError ? COPY.heightRangeError : undefined}
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-birth-date"
            className="text-style-caption block text-muted"
          >
            {COPY.birthDateLabel}
          </label>
          <DateField
            id="biometrics-birth-date"
            emptyLabel={COPY.birthDateLabel}
            // Власне вікно замість спільного календарного: народитись до
            // 1970-го — норма, а от у майбутньому — ні.
            bounded={false}
            min={BIRTH_DATE_MIN}
            max={getKyivDayKey()}
            value={form.birthDate}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, birthDate: e.target.value }))
            }
            disabled={editingDisabled}
            className="min-w-0 max-w-full"
            helperText={
              ageYears != null
                ? `${COPY.ageLabel}: ${ageYears} ${COPY.ageYearsSuffix}`
                : undefined
            }
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-sex"
            className="text-style-caption block text-muted"
          >
            {COPY.sexLabel}
          </label>
          <Select
            id="biometrics-sex"
            value={form.sex}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                sex: (e.target.value as Sex | "") ?? "",
              }))
            }
            disabled={editingDisabled}
            className="min-w-0 max-w-full"
          >
            <option value="">{COPY.sexPlaceholder}</option>
            {SEX_VALUES.map((value) => (
              <option key={value} value={value}>
                {SEX_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-activity"
            className="text-style-caption block text-muted"
          >
            {COPY.activityLabel}
          </label>
          <Select
            id="biometrics-activity"
            value={form.activityLevel}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                activityLevel: (e.target.value as ActivityLevel | "") ?? "",
              }))
            }
            disabled={editingDisabled}
            className="min-w-0 max-w-full"
          >
            <option value="">{COPY.activityPlaceholder}</option>
            {ACTIVITY_LEVELS.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_META[value].label}
              </option>
            ))}
          </Select>
          {form.activityLevel !== "" && (
            <p className="text-style-caption text-muted">
              {ACTIVITY_META[form.activityLevel].hint}
            </p>
          )}
        </div>

        {/* Тумблер стоїть саме тут, поруч із рівнем активності, бо він про
            ту саму модель розрахунку: увімкнений, він забирає тренування з
            множника і повертає їх явним доданком. У Фізруку йому не місце -
            це налаштування норми, а не тренувань. */}
        <div className="px-4 py-4 space-y-2">
          <Switch
            checked={form.countWorkoutsInGoal}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, countWorkoutsInGoal: checked }))
            }
            disabled={editingDisabled}
            label={COPY.countWorkoutsLabel}
            description={COPY.countWorkoutsHint}
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-weight"
            className="text-style-caption block text-muted"
          >
            {COPY.weightLabel}
          </label>
          <Input
            id="biometrics-weight"
            type="number"
            inputMode="decimal"
            min={WEIGHT_KG_RANGE.min}
            max={WEIGHT_KG_RANGE.max}
            step={0.1}
            value={form.weightKg}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, weightKg: e.target.value }))
            }
            onBlur={() => setWeightTouched(true)}
            placeholder="75.5"
            disabled={editingDisabled}
            className="min-w-0 max-w-full"
            error={weightShowError}
            helperText={
              weightShowError ? COPY.weightRangeError : COPY.weightSyncHint
            }
          />
        </div>

        <div className="px-4 py-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || editingDisabled}
            onClick={handleSave}
          >
            {COPY.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
