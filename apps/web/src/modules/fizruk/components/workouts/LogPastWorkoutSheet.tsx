/**
 * Last validated: 2026-09-01
 * Status: Active
 * Форма «Записати заняття» - тренування заднім числом.
 *
 * **Історія.** Такий сценарій у продукті вже був: кнопка на головній
 * «Тренувань» відкривала форму з датою й часом початку. Її змело в
 * [#589](https://github.com/SkOrDs-02/sergeant/pull/589) - той PR звів старт
 * до двох шляхів (Quick Start і шаблон), і в описі це рішення пояснене
 * прибиранням «Програм» як третього входу; ретро там не назване жодним
 * словом. Форма лишилась у коді без живої кнопки, а згодом її прибрали як
 * dead code, зафіксувавши в аудиті борг «дописати або прибрати».
 * Це - «дописати».
 *
 * **Чому не відновлення дослівно.** Стара форма питала лише початок, а
 * поле кінця в `WorkoutTimeEditor` закрите умовою `endedAt ?` - тобто
 * зʼявляється аж після завершення. Повернувши стару форму як була, ми
 * лишили б рівно ту скаргу, з якої все почалось: кінець виставити нічим.
 * Тому питаємо обидві мітки одразу.
 *
 * **Два шляхи в одній формі.** Тестерка з групових занять не памʼятає
 * підходи й повтори, вона памʼятає «силове, 45 хвилин». Тому зверху стоїть
 * вибір заняття з каталогу:
 *
 *   - **заняття обрано** - питаємо тривалість, зону й інтенсивність, і
 *     запис закривається одразу: сесія створюється ЗАВЕРШЕНОЮ, з одним
 *     item-ом типу `time`, і людина не потрапляє в детальний журнал;
 *   - **заняття не обрано** - поведінка не змінюється: питаємо кінець,
 *     сесія лишається живою, кінець чекає у `pendingRetroEnd` до кроку
 *     «Завершити», бо інакше завершене тренування малюється read-only
 *     підсумком, і ні вправи додати, ні оцінку пройти. Розбір -
 *     у [`fizruk.md` §3](../../../../../../docs/01-product/model/fizruk.md).
 *
 * **Зона питається не для краси.** Модель відновлення виводить навантаження
 * виключно з мʼязів вправ. Простий запис вправ не має, тож без зони Фізрук
 * показав би «свіжий» одразу після важкого групового заняття.
 *
 * **Чому `Sheet`, а не інлайн-смуга.** Перша версія рендерилась просто
 * блоком у потоці сторінки - і на беті це читалось як «кнопка не працює»:
 * форма зʼявлялась ПІД картками «Останні тренування» й «Довідники», тобто
 * за межами екрана, а кнопка, яка її відкриває, - угорі. Плюс вигляд голої
 * смуги без панелі. `Sheet` - канонічний примітив (портал повз усі
 * transform-контексти, фокус-трап, Escape, затемнення, свайп-закриття,
 * кнопка закриття 44×44, відступ під нижнє меню й клавіатуру); саме заради
 * таких випадків він і зводив докупи шість саморобних шітів.
 *
 * **Поля - спільні примітиви, а не сирі `<input>`.** Перша версія малювала
 * `type="date"` / `type="time"` руками з `w-full`, і на iOS форма виїжджала
 * за екран: нативні контроли мають власний intrinsic inline-size, а комірка
 * grid-а з дефолтним `min-width: auto` слухняно під нього розширювалась.
 * `DateField` існує рівно проти цього (той самий баг ловили у формах Фініка),
 * `TimeField` - його time-двійник. Скарга тестера 2026-08-16.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { Segmented } from "@shared/components/ui/Segmented";
import { Select } from "@shared/components/ui/Select";
import { Sheet } from "@shared/components/ui/Sheet";
import { TimeField } from "@shared/components/ui/TimeField";
import { messages } from "@shared/i18n/uk";
import { computeKcalBurned } from "@sergeant/fizruk-domain";
import {
  ACTIVITIES,
  ACTIVITY_CATEGORIES_UK,
  type ActivityDef,
  ACTIVITY_INTENSITIES_UK,
  ACTIVITY_MUSCLE_ZONES_UK,
  findActivityById,
  type ActivityCategory,
  type ActivityIntensity,
  type ActivityMuscleZone,
} from "@sergeant/fizruk-domain/data";
import {
  buildActivityWorkoutTimes,
  buildPastWorkoutTimes,
  todayLocalDateString,
} from "../../pages/Workouts.helpers";

/** Короткий запис: усе, що потрібно, аби зібрати завершену сесію з одним item-ом. */
export interface LogPastWorkoutActivity {
  activityId: string;
  nameUk: string;
  met: number;
  zone: ActivityMuscleZone;
  intensity: ActivityIntensity;
  durationSec: number;
  /** `null`, коли ваги немає - запис зберігається, просто без оцінки витрат. */
  kcalBurned: number | null;
}

export interface LogPastWorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Без `activity` - ЖИВА сесія з цими мітками, `endedAt` чекає кроку
   * «Завершити». З `activity` - завершений запис, який нікуди не веде.
   */
  onSubmit: (payload: {
    startedAt: string;
    endedAt: string;
    activity?: LogPastWorkoutActivity;
  }) => void;
  /** Поточна вага з fizruk-журналу; `null` - людина ще не зважувалась. */
  weightKg?: number | null | undefined;
  /** Записати щойно введену вагу як звичайне зважування (ADR-0080). */
  onRecordWeight?: ((weightKg: number) => void) | undefined;
  /** Вбудований каталог плюс свої заняття. За замовчуванням - лише вбудований. */
  activities?: ActivityDef[] | undefined;
  /** Зберегти щойно заведене своє заняття. Без нього опція не показується. */
  onCreateActivity?: ((activity: ActivityDef) => void) | undefined;
}

/** Дефолт початку - вечір: найчастіший час тренування, який доводиться правити. */
const DEFAULT_START = "18:00";
const DEFAULT_END = "19:00";
const DEFAULT_DURATION_MIN = "45";

const DURATION_PRESETS: string[] = ["15", "30", "45", "60"];

/**
 * Службове значення селекта: «завести своє заняття». Живе поруч зі
 * справжніми id, бо це той самий вибір з погляду людини - просто його ще
 * нема в списку.
 */
const NEW_ACTIVITY_VALUE = "__new__";

/**
 * MET за рівнем навантаження. Питати число в людини безглуздо: MET знає
 * той, хто його вже знає, а решта побачить порожнє поле й кине форму.
 * Числа - опорні точки Compendium: спокійне ~ходьба, помірне ~силове
 * тренування, інтенсивне ~біг чи кросфіт.
 */
const DEFAULT_CUSTOM_ACTIVITY_MET = 6.0;
const CUSTOM_ACTIVITY_MET: Record<string, number> = {
  light: 3.5,
  moderate: DEFAULT_CUSTOM_ACTIVITY_MET,
  intense: 8.5,
};

const CATEGORY_ORDER: ActivityCategory[] = [
  "strength",
  "cardio",
  "group",
  "flexibility",
];

const ZONE_ITEMS = (
  Object.keys(ACTIVITY_MUSCLE_ZONES_UK) as ActivityMuscleZone[]
).map((value) => ({ value, label: ACTIVITY_MUSCLE_ZONES_UK[value] }));

const EFFORT_ITEMS: { value: string; label: string }[] = [
  { value: "light", label: "Спокійне" },
  { value: "moderate", label: "Помірне" },
  { value: "intense", label: "Інтенсивне" },
];

const INTENSITY_ITEMS = (
  Object.keys(ACTIVITY_INTENSITIES_UK) as ActivityIntensity[]
).map((value) => ({ value, label: ACTIVITY_INTENSITIES_UK[value] }));

export function LogPastWorkoutSheet({
  open,
  onClose,
  onSubmit,
  weightKg = null,
  onRecordWeight,
  activities = ACTIVITIES,
  onCreateActivity,
}: LogPastWorkoutSheetProps) {
  const fieldsId = useId();
  const dateId = `${fieldsId}-date`;
  const startId = `${fieldsId}-start`;
  const endId = `${fieldsId}-end`;
  const activityId = `${fieldsId}-activity`;
  const durationId = `${fieldsId}-duration`;
  const newNameId = `${fieldsId}-new-name`;
  const newCategoryId = `${fieldsId}-new-category`;
  const weightId = `${fieldsId}-weight`;

  // Перераховуємо на КОЖНЕ відкриття, а не раз на монтування. Шіт живе в
  // дереві постійно (закритий = `open: false`), тож обчислений один раз
  // «сьогодні» переживає північ: застосунок, відкритий звечора, о 00:02
  // пропонував учорашню дату й ліміт `max` теж учорашній.
  const today = useMemo(() => (open ? todayLocalDateString() : ""), [open]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [activity, setActivity] = useState("");
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [zone, setZone] = useState<ActivityMuscleZone>("full");
  const [intensity, setIntensity] = useState<ActivityIntensity>("normal");
  const [weightInput, setWeightInput] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<ActivityCategory>("strength");
  const [newEffort, setNewEffort] = useState("moderate");
  /**
   * Щойно створене заняття. Тримаємо локально, бо `activities` приходить
   * згори: між `onCreateActivity` і перерендером батька селект уже вказує
   * на id, якого в списку ще немає - і форма мовчки поводилась би як
   * «заняття не обрано», тобто створювала б порожню сесію замість запису.
   */
  const [justCreated, setJustCreated] = useState<ActivityDef | null>(null);

  // Відкриття = новий запис: підставляємо свіже «сьогодні» замість того, що
  // лишилось від минулого разу.
  const lastOpenRef = useRef(false);
  useEffect(() => {
    if (open && !lastOpenRef.current) setDate(today);
    lastOpenRef.current = open;
  }, [open, today]);

  const t = messages.fizruk.logPast;

  const creatingActivity = activity === NEW_ACTIVITY_VALUE;
  const selectedActivity =
    activity && !creatingActivity
      ? (findActivityById(activity, activities) ??
        (justCreated?.id === activity ? justCreated : null))
      : null;
  const durationValue = Number(durationMin);

  const times = useMemo(
    () =>
      selectedActivity
        ? buildActivityWorkoutTimes(date, start, Number(durationMin))
        : buildPastWorkoutTimes(date, start, end),
    [selectedActivity, date, start, end, durationMin],
  );

  // Введена тут вага працює одразу: показувати «приблизно 0 ккал» до
  // натискання «Записати» означало б робити вигляд, що поле нічого не
  // змінює, поки воно вже заповнене.
  const typedWeight = Number(weightInput.replace(",", "."));
  const effectiveWeightKg =
    weightKg != null && weightKg > 0
      ? weightKg
      : Number.isFinite(typedWeight) && typedWeight > 0
        ? typedWeight
        : null;

  const kcal = selectedActivity
    ? computeKcalBurned({
        met: selectedActivity.met,
        intensity,
        weightKg: effectiveWeightKg,
        durationSec: durationValue * 60,
      })
    : null;

  const blocked =
    !times ||
    times.inFuture ||
    times.implausiblyLong ||
    (selectedActivity !== null && !(durationValue > 0)) ||
    // Поки відкрита форма створення, «Записати» означало б «записати БЕЗ
    // заняття» - тобто мовчки не те, чого людина щойно почала робити.
    creatingActivity;

  const canSaveNewActivity = newName.trim().length > 0;

  const handleCreateActivity = () => {
    if (!canSaveNewActivity || !onCreateActivity) return;
    const created: ActivityDef = {
      id: `custom_${crypto.randomUUID()}`,
      nameUk: newName.trim(),
      met: CUSTOM_ACTIVITY_MET[newEffort] ?? DEFAULT_CUSTOM_ACTIVITY_MET,
      category: newCategory,
    };
    onCreateActivity(created);
    setJustCreated(created);
    // Одразу обираємо створене: людина відкривала форму, щоб записати
    // заняття, а не щоб поповнити довідник.
    setActivity(created.id);
    setNewName("");
  };

  const handleSubmit = () => {
    // Та сама умова, що й `disabled` - кнопка не єдиний шлях сюди
    // (Enter, автоклік, тест), і розʼїхатись цим двом не можна.
    if (blocked || !times) return;
    if (weightKg == null && effectiveWeightKg != null && onRecordWeight) {
      onRecordWeight(effectiveWeightKg);
    }
    onSubmit({
      startedAt: times.startedAt,
      endedAt: times.endedAt,
      ...(selectedActivity
        ? {
            activity: {
              activityId: selectedActivity.id,
              nameUk: selectedActivity.nameUk,
              met: selectedActivity.met,
              zone,
              intensity,
              durationSec: Math.round(durationValue * 60),
              kcalBurned: kcal,
            },
          }
        : {}),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.title}
      closeLabel={messages.actions.close}
      footer={
        <Button
          module="fizruk"
          className="w-full h-11"
          disabled={blocked}
          onClick={handleSubmit}
        >
          {t.submit}
        </Button>
      }
    >
      <div className="w-full min-w-0 max-w-full space-y-3 pt-1">
        <div className="min-w-0">
          <label
            htmlFor={activityId}
            className="text-style-label text-text leading-snug"
          >
            {t.activity}
          </label>
          <Select
            id={activityId}
            accent="fizruk"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="mt-1 min-w-0 max-w-full"
          >
            <option value="">{t.activityNone}</option>
            {CATEGORY_ORDER.map((category) => (
              <optgroup key={category} label={ACTIVITY_CATEGORIES_UK[category]}>
                {activities
                  .filter((a) => a.category === category)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameUk}
                    </option>
                  ))}
              </optgroup>
            ))}
            {onCreateActivity ? (
              <option value={NEW_ACTIVITY_VALUE}>{t.activityNew}</option>
            ) : null}
          </Select>
          {!selectedActivity && !creatingActivity ? (
            <p className="text-style-caption text-subtle mt-1">
              {t.activityNoneHint}
            </p>
          ) : null}
        </div>

        {creatingActivity ? (
          /* Заводимо просто тут, а не окремим екраном: людина вже посеред
             запису, і відправити її в довідник означало б загубити введені
             дату й час. MET не питаємо числом - лише рівень навантаження. */
          <div className="min-w-0 space-y-2 rounded-2xl border border-line bg-panelHi p-3">
            <div className="min-w-0">
              <label
                htmlFor={newNameId}
                className="text-style-label text-text leading-snug"
              >
                {t.newActivityName}
              </label>
              <Input
                id={newNameId}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.newActivityNamePlaceholder}
                maxLength={60}
                className="mt-1 min-w-0 max-w-full"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor={newCategoryId}
                className="text-style-label text-text leading-snug"
              >
                {t.newActivityCategory}
              </label>
              <Select
                id={newCategoryId}
                accent="fizruk"
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as ActivityCategory)
                }
                className="mt-1 min-w-0 max-w-full"
              >
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {ACTIVITY_CATEGORIES_UK[category]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <span className="text-style-label text-text leading-snug block">
                {t.newActivityEffort}
              </span>
              <Segmented
                variant="fizruk"
                ariaLabel={t.newActivityEffort}
                items={EFFORT_ITEMS}
                value={newEffort}
                onChange={setNewEffort}
              />
              <p className="text-style-caption text-subtle">
                {t.newActivityEffortHint}
              </p>
            </div>
            <Button
              variant="secondary"
              className="w-full h-11"
              disabled={!canSaveNewActivity}
              onClick={handleCreateActivity}
            >
              {t.newActivitySave}
            </Button>
          </div>
        ) : null}

        {/* `min-w-0` на КОЖНІЙ комірці, не лише на самих полях: без нього
            grid-трек росте під intrinsic-ширину нативного пікера, і картка
            їде за екран навіть тоді, коли поле всередині поводиться чемно. */}
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <DateField
              id={dateId}
              label={t.date}
              // Відсікає майбутні ДНІ в самому пікері. Майбутній ЧАС у межах
              // сьогодні цим не ловиться - це робить `times.inFuture` нижче.
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <TimeField
              id={startId}
              label={t.start}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          {selectedActivity ? null : (
            <div className="min-w-0">
              <TimeField
                id={endId}
                label={t.end}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        {selectedActivity ? (
          <>
            <div className="min-w-0 space-y-2">
              <label
                htmlFor={durationId}
                className="text-style-label text-text leading-snug"
              >
                {t.duration}
              </label>
              <Segmented
                variant="fizruk"
                ariaLabel={t.duration}
                items={DURATION_PRESETS.map((value) => ({
                  value,
                  label: `${value} ${t.durationUnit}`,
                }))}
                value={
                  DURATION_PRESETS.includes(durationMin) ? durationMin : ""
                }
                onChange={setDurationMin}
              />
              <Input
                id={durationId}
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="min-w-0 max-w-full"
              />
            </div>

            <div className="min-w-0 space-y-2">
              <span className="text-style-label text-text leading-snug block">
                {t.zone}
              </span>
              <Segmented
                variant="fizruk"
                ariaLabel={t.zone}
                items={ZONE_ITEMS}
                value={zone}
                onChange={setZone}
              />
            </div>

            <div className="min-w-0 space-y-2">
              <span className="text-style-label text-text leading-snug block">
                {t.intensity}
              </span>
              <Segmented
                variant="fizruk"
                ariaLabel={t.intensity}
                items={INTENSITY_ITEMS}
                value={intensity}
                onChange={setIntensity}
              />
            </div>

            {weightKg == null ? (
              <div className="min-w-0">
                <label
                  htmlFor={weightId}
                  className="text-style-label text-text leading-snug"
                >
                  {t.weight}
                </label>
                <Input
                  id={weightId}
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={400}
                  step={0.1}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="75.5"
                  helperText={t.weightHint}
                  className="mt-1 min-w-0 max-w-full"
                />
              </div>
            ) : null}

            {kcal !== null ? (
              <p className="text-style-caption text-fizruk-strong">
                {t.kcalPreview} {kcal} {t.kcalUnit}
              </p>
            ) : null}
          </>
        ) : null}

        {/* Один підпис за раз, у порядку «причина → наслідок». Описка в часі
            («18:00 → 16:00») на сьогоднішній даті дає ОБИДВА стани, бо
            перенесений кінець їде в завтра; показати тут «завершення ще не
            настало» означало б пояснити наслідок і сховати причину. */}
        {times?.implausiblyLong ? (
          <p className="text-style-caption text-subtle">{t.implausiblyLong}</p>
        ) : times?.inFuture ? (
          <p className="text-style-caption text-subtle">{t.inFuture}</p>
        ) : times?.crossesMidnight ? (
          <p className="text-style-caption text-subtle">{t.crossesMidnight}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
