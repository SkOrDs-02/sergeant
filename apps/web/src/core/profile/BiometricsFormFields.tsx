/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Спільна форма біометрики: поля, валідація, diff і запис. Її рендерять і
 * `BiometricsSection` (Профіль), і аркуш «Моя норма» в модулі Їжа, тож обидва
 * входи пишуть у те саме сховище з тими самими правилами (L-4, D1, D7).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@shared/components/ui/Input";
import { DateField } from "@shared/components/ui/DateField";
import { normalizeAmountInput } from "@shared/lib/format/amount";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { Select } from "@shared/components/ui/Select";
import { messages } from "@shared/i18n/uk";
import {
  ACTIVITY_LEVELS,
  HEIGHT_CM_RANGE,
  SEX_VALUES,
  WEIGHT_KG_RANGE,
  computeAgeYears,
  type ActivityLevel,
  type Biometrics,
  type Sex,
} from "./biometrics";
import type { UseBiometricsResult } from "./useBiometrics";

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

export interface FormState {
  heightCm: string;
  birthDate: string;
  sex: Sex | "";
  activityLevel: ActivityLevel | "";
  weightKg: string;
  countWorkoutsInGoal: boolean;
}

export function biometricsToForm(b: Biometrics): FormState {
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
export type RangedFieldParse =
  { kind: "empty" } | { kind: "invalid" } | { kind: "value"; value: number };

export function parseRangedField(
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
export function diffFormAgainst(
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

/**
 * Біометрика, якою стала б форма після збереження: порожнє поле - `null`,
 * невалідне - лишається збережене значення (так само, як у diff).
 */
export function formToBiometrics(
  form: FormState,
  base: Biometrics,
): Biometrics {
  const height = parseRangedField(form.heightCm, HEIGHT_CM_RANGE);
  const weight = parseRangedField(form.weightKg, WEIGHT_KG_RANGE);
  return {
    ...base,
    heightCm:
      height.kind === "value"
        ? height.value
        : height.kind === "empty"
          ? null
          : base.heightCm,
    weightKg:
      weight.kind === "value"
        ? weight.value
        : weight.kind === "empty"
          ? null
          : base.weightKg,
    birthDate: form.birthDate.trim() === "" ? null : form.birthDate,
    sex: form.sex === "" ? null : form.sex,
    activityLevel: form.activityLevel === "" ? null : form.activityLevel,
    countWorkoutsInGoal: form.countWorkoutsInGoal,
  };
}

type BiometricsDiff = NonNullable<ReturnType<typeof diffFormAgainst>>;

/**
 * Записує diff форми: вага йде через fizruk-журнал (`addEntry` дзеркалить її
 * назад у біометрику зі своїм `at`), решта через `saveBiometrics`. Кидає, якщо
 * запис не вдався; тост показує викликач.
 */
export function persistBiometricsDiff(
  diff: BiometricsDiff,
  deps: {
    saveBiometrics: UseBiometricsResult["saveBiometrics"];
    addDailyLogEntry: (entry: { weightKg: number }) => void;
  },
): void {
  // `weightKg` НЕ виймаємо з `rest`: `hasOwnProperty` - рантайм-перевірка,
  // яку TS не вміє звужувати, тож зібраний назад патч мав тип
  // `number | null | undefined` і під `exactOptionalPropertyTypes: true`
  // не проходив у `saveBiometrics`.
  const { changed: _changed, ...rest } = diff;
  void _changed;
  const weightInPatch = Object.prototype.hasOwnProperty.call(diff, "weightKg");
  const weightKg = diff.weightKg;
  // D7: `writeBiometricsPatch` не ідемпотентний - з `weightKg` у патчі він
  // перебиває `weightUpdatedAt` своїм "зараз". Коли вагу вже задзеркалено
  // через `addDailyLogEntry`, LWW-маркер мусить лишитись часом зважування,
  // тому `weightKg` виключається з другого патча.
  const mirroredWeight = weightInPatch && weightKg != null;
  const { weightKg: _mirroredWeightKg, ...nonWeightRest } = rest;
  void _mirroredWeightKg;
  const savePatch = mirroredWeight ? nonWeightRest : rest;
  // Вага першою: addEntry дзеркалить у біометрику зі своїм `at`. Очищення
  // ваги в `null` - правка знімка, у журнал нічого не пишемо.
  if (mirroredWeight) {
    deps.addDailyLogEntry({ weightKg: weightKg as number });
  }
  // L-17: `saveBiometrics` кличеться безумовно, бо саме він пушить на сервер,
  // навіть коли `savePatch` порожній (змінилась тільки вага).
  deps.saveBiometrics(savePatch);
}

/**
 * Стан форми біометрики: поля, blur-гейт помилок (D4), live-валідність (D1),
 * diff проти збереженого значення.
 */
export function useBiometricsForm(biometrics: Biometrics) {
  const [form, setForm] = useState<FormState>(() =>
    biometricsToForm(biometrics),
  );
  const [prevBiometrics, setPrevBiometrics] = useState(biometrics);
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
  const ageYears = useMemo(
    () => computeAgeYears(biometrics.birthDate),
    [biometrics.birthDate],
  );
  return {
    form,
    setForm,
    ageYears,
    diff,
    dirty: diff !== null && !heightInvalid && !weightInvalid,
    hasInvalidField: heightInvalid || weightInvalid,
    heightShowError: heightInvalid && heightTouched,
    weightShowError: weightInvalid && weightTouched,
    touchHeight: () => setHeightTouched(true),
    touchWeight: () => setWeightTouched(true),
  };
}

export type BiometricsFormState = ReturnType<typeof useBiometricsForm>;

interface BiometricsFormFieldsProps {
  state: BiometricsFormState;
  disabled?: boolean;
  /** Місце між рівнем активності та вагою (тумблер динамічного режиму). */
  afterActivity?: ReactNode;
  /** Класи обгортки кожного поля. */
  fieldClassName?: string;
}

export function BiometricsFormFields({
  state,
  disabled = false,
  afterActivity,
  fieldClassName = "px-4 py-4 space-y-2",
}: BiometricsFormFieldsProps) {
  const { form, setForm } = state;
  const { ageYears } = state;
  return (
    <>
      <div className={fieldClassName}>
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
          onBlur={state.touchHeight}
          placeholder="175"
          disabled={disabled}
          className="min-w-0 max-w-full"
          error={state.heightShowError}
          helperText={state.heightShowError ? COPY.heightRangeError : undefined}
        />
      </div>

      <div className={fieldClassName}>
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
          // 1970-го - норма, а от у майбутньому - ні.
          bounded={false}
          min={BIRTH_DATE_MIN}
          max={getKyivDayKey()}
          value={form.birthDate}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, birthDate: e.target.value }))
          }
          disabled={disabled}
          className="min-w-0 max-w-full"
          helperText={
            ageYears != null
              ? `${COPY.ageLabel}: ${ageYears} ${COPY.ageYearsSuffix}`
              : undefined
          }
        />
      </div>

      <div className={fieldClassName}>
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
          disabled={disabled}
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

      <div className={fieldClassName}>
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
          disabled={disabled}
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

      {afterActivity}

      <div className={fieldClassName}>
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
          onBlur={state.touchWeight}
          placeholder="75.5"
          disabled={disabled}
          className="min-w-0 max-w-full"
          error={state.weightShowError}
          helperText={
            state.weightShowError ? COPY.weightRangeError : COPY.weightSyncHint
          }
        />
      </div>
    </>
  );
}
