/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Hero-стрічка дня Їжі (спека
 * `docs/90-work/planning/specs/nutrition-hero-day-strip.md`, анти-слоп
 * аудит Q3/F6). Замінює `ProgressRing` + `MacroRings` у
 * `NutritionDashboard`'s `prominence="hero"` картці: чотири сегменти за
 * `MEAL_ORDER` (не за фактичним порядком запису — інакше стрічка різна
 * щодня і не показує, чого ще бракує), головне число — залишок до норми.
 *
 * AI-CONTEXT: назва навмисно НЕ `DayStrip` — цей файл уже існує
 * (`./DayStrip.tsx`) і рендерить іншу signature-view (годинний розподіл
 * калорій, `../lib/dayStrip.ts`, канон nutrition §5.1 «Друга поверхня
 * тієї самої частки»). Той компонент лишається недоторканим у
 * `DayLogSheet`; `MealStrip` — окрема форма для hero.
 *
 * **Сегменти клікабельні (рішення власника 2026-09-11).** Тап по «Обід»
 * відкриває аркуш прийому з уже обраним `mealType`. До того hero був
 * індикатором, з якого не зробиш нічого: єдиною дією лишався FAB, а він
 * відкриває аркуш БЕЗ типу — тип угадував годинник (`mealTypeByNow`).
 * Тепер FAB — вхід «щось нове», сегмент — вхід «у цей прийом».
 *
 * **Один рядок замість двох.** Було: пропорційні бари зверху й колонки з
 * назвою та ккал знизу — два ряди, що кодують те саме число. Стало: чотири
 * РІВНІ колонки-кнопки, а пропорція живе заливкою всередині колонки
 * (`width` = частка прийому в зʼїденому). Порівняння прийомів лишилось
 * видимим, підпис не обрізається на вузькому екрані (ризик 2 спеки), а
 * ризик 1 — вузький сегмент — зник разом із пропорційною шириною колонки.
 *
 * A11y: спільний `role="img"` лишився ТІЛЬКИ за блоком залишку — за тим,
 * що справді є картинкою з числом. Сегменти більше не `aria-hidden`: вони
 * кнопки, а кнопка під `aria-hidden` недосяжна. Факт кожного прийому несе
 * доступна назва його кнопки («Обід, 520 ккал. Додати в обід»), тож
 * перелік прийомів прибрано зі спільної мітки — інакше AT диктував би ті
 * самі слова двічі.
 */
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import type { MealTypeId } from "@sergeant/nutrition-domain";
import { REMAINING_TODAY_LABEL } from "../lib/nextMealLabel";
import { nutritionPageMessages as nutritionCopy } from "@shared/i18n/uk.nutrition";

export interface MealStripSegment {
  type: MealTypeId;
  label: string;
  kcal: number;
}

export interface MealStripMacro {
  label: string;
  consumed: number;
  /** `0` means "no goal for this macro" — renders fact only (рішення 4). */
  goal: number;
  unit?: string;
}

export interface MealStripProps {
  /** Рівно чотири елементи, у порядку `MEAL_ORDER`. */
  segments: MealStripSegment[];
  /** `null` — норма не задана (`prefs.dailyTargetKcal <= 0`). */
  goalKcal: number | null;
  /** «лишилось на …» / «лишилось сьогодні» — з `nextMealLabel`. */
  remainingLabel: string;
  macros: MealStripMacro[];
  /**
   * CTA-обробник, коли норми немає. Без нього кнопка НЕ рендериться:
   * увімкнена кнопка, яка нічого не робить, гірша за її відсутність
   * (порожній стан лишається чесним — стрічка за фактом без залишку).
   */
  onSetGoal?: (() => void) | undefined;
  /**
   * Тап по сегменту. Обовʼязковий навмисно: без нього сегменти лишались
   * би `aria-hidden`-картинкою, і hero знову став би індикатором, з якого
   * нічого не зробиш — саме тим, на що скаржився власник. FAB лишається
   * для «щось нове», сегмент — для «в цей прийом».
   */
  onPickMeal: (type: MealTypeId) => void;
  /**
   * «Записано N із 4» — канон §5.2, неповний день лишається чесним, не
   * дефіцитом. Рендериться ПОЗА `role="img"`-блоком як окремий
   * текстовий вузол (спека не включає цю фразу у власний aria-label
   * приклад — і без потреби дублювати той самий факт двічі для AT).
   */
  incompleteNote?: string | undefined;
}

const ARIA_NOT_RECORDED: Record<MealTypeId, string> = {
  breakfast: "сніданок не записаний",
  lunch: "обід не записаний",
  dinner: "вечеря не записана",
  snack: "перекус не записаний",
};

const REMAINING_ON_PREFIX = "лишилось на ";

/** Дія кнопки сегмента — другим реченням доступної назви. */
const ADD_TO_MEAL: Record<MealTypeId, string> = {
  breakfast: "Додати в сніданок",
  lunch: "Додати в обід",
  dinner: "Додати у вечерю",
  snack: "Додати в перекус",
};

/** Факт прийому — першим реченням доступної назви кнопки. */
function segmentAriaFact(seg: MealStripSegment): string {
  if (seg.kcal <= 0) {
    const notRecorded = ARIA_NOT_RECORDED[seg.type];
    return notRecorded.charAt(0).toUpperCase() + notRecorded.slice(1);
  }
  return `${seg.label}, ${Math.round(seg.kcal)} ккал`;
}

/**
 * Доступна назва блока залишку. Перелік прийомів звідси прибрано: тепер
 * кожен сегмент — кнопка з власною доступною назвою, і повторювати ті
 * самі факти в спільному `aria-label` означало б диктувати їх двічі.
 * Лишається рівно те, що є картинкою з числом, — залишок до норми.
 */
function buildRemainingAriaLabel(
  remaining: number,
  remainingLabel: string,
): string {
  const sentence =
    remaining < 0
      ? `${Math.round(Math.abs(remaining))} ккал понад норму`
      : remainingLabel === REMAINING_TODAY_LABEL
        ? `лишилось ${Math.round(remaining)} ккал сьогодні`
        : remainingLabel.startsWith(REMAINING_ON_PREFIX)
          ? `лишилось ${Math.round(remaining)} ккал на ${remainingLabel.slice(
              REMAINING_ON_PREFIX.length,
            )}`
          : remainingLabel;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Індекс сегмента, що першим переводить накопичену суму ккал за межу
 * норми — рішення 5: акцент дістає рівно один сегмент, не всі після
 * нього.
 */
function findAccentIndex(
  segments: readonly MealStripSegment[],
  goalKcal: number | null,
): number | null {
  if (goalKcal == null) return null;
  let cumulative = 0;
  for (const [i, seg] of segments.entries()) {
    cumulative += seg.kcal;
    if (cumulative > goalKcal) return i;
  }
  return null;
}

export function MealStrip({
  segments,
  goalKcal,
  remainingLabel,
  macros,
  onSetGoal,
  onPickMeal,
  incompleteNote,
}: MealStripProps) {
  const total = segments.reduce((sum, s) => sum + s.kcal, 0);
  const remaining = goalKcal != null ? goalKcal - total : null;
  const accentIndex = findAccentIndex(segments, goalKcal);

  return (
    <div className="flex flex-col gap-3">
      {/*
        ОДИН рядок сегментів, і кожен — кнопка. Було два ряди, що кодували
        те саме число двічі: пропорційні бари зверху й колонки з назвою та
        ккал знизу. Пропорція нікуди не поділась — вона тепер заливка
        всередині колонки фіксованої ширини, тож і порівняння прийомів
        видно, і підпис не обрізається на вузькому екрані (ризик 2 спеки).

        A11y: рядок більше НЕ живе всередині `role="img"`. Кнопка не може
        бути `aria-hidden`, а саме такими були обидва старі ряди. Тепер
        факт кожного прийому несе доступна назва його кнопки, а спільний
        `aria-label` лишається тільки за блоком залишку — тобто за тим,
        що справді є картинкою з числом.
      */}
      <ul data-testid="meal-strip-bars" className="grid grid-cols-4 gap-1">
        {segments.map((seg, i) => {
          const isEmpty = seg.kcal <= 0;
          const isAccent = accentIndex === i;
          const share = total > 0 ? (seg.kcal / total) * 100 : 0;
          const body = (
            <>
              <span
                aria-hidden="true"
                data-testid="meal-strip-fill"
                style={{ width: `${share}%` }}
                className={cn(
                  "absolute inset-y-0 left-0 rounded-lg",
                  isAccent ? "bg-nutrition" : "bg-hero-ink/30",
                )}
              />
              <span className="relative text-style-caption text-hero-ink/90 truncate w-full">
                {seg.label}
              </span>
              <span className="relative text-style-caption text-hero-ink tabular-nums truncate w-full">
                {seg.kcal > 0 ? Math.round(seg.kcal) : "—"}
              </span>
            </>
          );
          return (
            <li key={seg.type} className="flex">
              <button
                type="button"
                onClick={() => onPickMeal(seg.type)}
                aria-label={`${segmentAriaFact(seg)}. ${ADD_TO_MEAL[seg.type]}`}
                className={cn(
                  "relative isolate flex w-full flex-col items-center justify-center",
                  "overflow-hidden rounded-lg border border-hero-ink/20 px-1 py-1.5",
                  isEmpty ? "bg-hero-ink/10" : "bg-hero-ink/5",
                  // 44×44 під coarse pointer — сегмент тепер найдрібніший
                  // тапабельний контрол hero-картки.
                  "pointer-coarse:min-h-[44px] motion-safe:transition-colors",
                  "hover:bg-hero-ink/15 active:bg-hero-ink/20",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-hero",
                )}
              >
                {body}
              </button>
            </li>
          );
        })}
      </ul>

      {goalKcal != null && remaining != null && (
        <div
          role="img"
          aria-label={buildRemainingAriaLabel(remaining, remainingLabel)}
          className="flex flex-col gap-1.5"
        >
          <div className="mt-1 flex flex-col items-center gap-0.5 text-center">
            {remaining < 0 ? (
              <>
                <p className="text-style-display text-hero-ink tabular-nums">
                  −{Math.round(Math.abs(remaining))}
                </p>
                <p className="text-style-caption text-hero-ink">
                  {nutritionCopy.heroStrip.overshootSuffix}
                </p>
              </>
            ) : (
              <>
                <p className="text-style-display text-hero-ink tabular-nums">
                  {Math.round(remaining)}{" "}
                  <span className="text-style-caption text-hero-ink">
                    {nutritionCopy.heroStrip.kcalUnit}
                  </span>
                </p>
                <p className="text-style-caption text-hero-ink">
                  {remainingLabel}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {incompleteNote && (
        <p className="text-style-caption text-hero-ink/80 text-center">
          {incompleteNote}
        </p>
      )}

      {goalKcal == null && onSetGoal && (
        <div className="flex justify-center">
          <Button variant="nutrition" size="md" onClick={onSetGoal}>
            {nutritionCopy.heroStrip.ctaSetGoal}
          </Button>
        </div>
      )}

      <ul
        aria-label={nutritionCopy.macrosToday}
        className="grid grid-cols-3 gap-3"
      >
        {macros.map((m) => {
          const unit = m.unit ?? "г";
          const pct =
            m.goal > 0
              ? Math.min(100, Math.round((m.consumed / m.goal) * 100))
              : m.consumed > 0
                ? 100
                : 0;
          return (
            <li key={m.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-style-caption text-hero-ink tabular-nums">
                <span>{m.label}</span>
                <span>
                  {m.consumed}
                  {m.goal > 0 ? ` / ${m.goal}` : ""} {unit}
                </span>
              </div>
              <div
                role="img"
                aria-label={
                  m.goal > 0
                    ? `${m.label}: ${m.consumed} з ${m.goal} ${unit}`
                    : `${m.label}: ${m.consumed} ${unit}`
                }
                className="h-1.5 rounded-full bg-hero-ink/15 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-hero-ink/60 motion-safe:transition-[width] motion-safe:duration-slow"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
