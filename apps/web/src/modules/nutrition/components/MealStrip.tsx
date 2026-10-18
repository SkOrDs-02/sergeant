/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Hero-стрічка дня Їжі (спека
 * `docs/work/specs/nutrition-hero-day-strip.md`, анти-слоп
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
 * **Сегменти клікабельні (рішення власника 2026-09-11).** До того hero був
 * індикатором, з якого не зробиш нічого: єдиною дією лишався FAB, а він
 * відкриває аркуш БЕЗ типу — тип угадував годинник (`mealTypeByNow`).
 *
 * **Куди веде тап — уточнено 2026-09-15.** Спершу сегмент відкривав форму
 * додавання з уже обраним типом; власник заперечив: сегмент НЕСЕ факт
 * («Вечеря, 520 ккал»), тож тап має цей факт розгорнути, а не почати новий
 * запис. Тепер записаний прийом відкриває `MealTypeSheet` зі своїми
 * рядками, а порожній — і далі форму, бо показувати в ньому нічого. Вхід
 * «щось нове» лишається один — FAB.
 *
 * **Один рядок замість двох.** Було: пропорційні бари зверху й колонки з
 * назвою та ккал знизу — два ряди, що кодують те саме число. Стало: чотири
 * РІВНІ колонки-кнопки, а пропорція живе баром під підписом колонки
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
import { messages } from "@shared/i18n/uk";
import type { MealTypeId } from "@sergeant/nutrition-domain";
import { formatNumberUk } from "@sergeant/shared";
import { REMAINING_TODAY_LABEL } from "../lib/nextMealLabel";

export interface MealStripSegment {
  type: MealTypeId;
  label: string;
  kcal: number;
  /**
   * Скільки записів у цьому прийомі — і саме воно, а не `kcal`, вирішує,
   * порожній сегмент чи ні. Запис без макросів (фото, яке не розпізналось;
   * страва, для якої КБЖВ ще не проставили) дає нуль калорій, але існує:
   * за калоріями сегмент читався б як «не записано», а тап відкривав би
   * аркуш із рядками — дві поверхні суперечили б одна одній.
   */
  count: number;
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
   * нічого не зробиш — саме тим, на що скаржився власник.
   *
   * Що саме відкривається, вирішує викликач, і воно різне (рішення
   * власника 2026-09-15): записаний прийом розгортається аркушем
   * `MealTypeSheet` («що в мене у вечері»), порожній — формою додавання з
   * уже обраним типом, бо показувати там нічого. Стрічка про цю розвилку
   * знає рівно стільки, скільки потрібно для чесного підпису кнопки, —
   * через `segment.count`.
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

/**
 * Дія кнопки сегмента — другим реченням доступної назви. Пар дві, бо дія
 * різна: порожній прийом веде у форму додавання, записаний — в аркуш із
 * його рядками. Обіцяти «Додати» там, де відкриється список, означало б
 * для AT-користувача збрехати про наслідок натискання.
 */
const ADD_TO_MEAL: Record<MealTypeId, string> = {
  breakfast: "Додати в сніданок",
  lunch: "Додати в обід",
  dinner: "Додати у вечерю",
  snack: "Додати в перекус",
};

const SHOW_MEAL: Record<MealTypeId, string> = {
  breakfast: "Показати записи сніданку",
  lunch: "Показати записи обіду",
  dinner: "Показати записи вечері",
  snack: "Показати записи перекусу",
};

/** Факт прийому — першим реченням доступної назви кнопки. */
function segmentAriaFact(seg: MealStripSegment): string {
  if (seg.count <= 0) {
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
      ? `${Math.round(Math.abs(remaining))} ккал понад ціль`
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

/** На скільки спожите перевищує ціль; `0` на межі, нижче цілі і без цілі. */
export function macroOverage(consumed: number, goal: number): number {
  return goal > 0 && consumed > goal ? consumed - goal : 0;
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
    <div className="flex flex-col gap-4">
      {goalKcal != null && remaining != null && (
        <div
          role="img"
          aria-label={buildRemainingAriaLabel(remaining, remainingLabel)}
        >
          {remaining < 0 ? (
            /* Без мінуса: підпис поруч уже каже «понад ціль», і
               «−250 … понад ціль» читалось як подвійне заперечення. */
            <p className="text-style-display text-text tabular-nums">
              {formatNumberUk(Math.round(Math.abs(remaining)))}{" "}
              <span className="text-style-label text-text">
                {messages.nutrition.heroStrip.overshootSuffix}
              </span>
            </p>
          ) : (
            <p className="text-style-display text-text tabular-nums">
              {formatNumberUk(Math.round(remaining))}{" "}
              <span className="text-style-label text-text">
                {messages.nutrition.heroStrip.kcalUnit} · {remainingLabel}
              </span>
            </p>
          )}
        </div>
      )}

      {/*
        ОДИН рядок сегментів, і кожен — кнопка. Пропорція прийому живе
        баром під підписом (частка в зʼїденому), колонки рівні, тож підпис
        не обрізається на вузькому екрані (ризик 2 спеки).

        A11y: рядок НЕ живе всередині `role="img"`. Кнопка не може бути
        `aria-hidden`; факт кожного прийому несе доступна назва його кнопки,
        а спільний `aria-label` лишається тільки за блоком залишку.
      */}
      <ul data-testid="meal-strip-bars" className="grid grid-cols-4 gap-2">
        {segments.map((seg, i) => {
          const isEmpty = seg.count <= 0;
          const isAccent = accentIndex === i;
          const share = total > 0 ? (seg.kcal / total) * 100 : 0;
          return (
            <li key={seg.type} className="flex">
              <button
                type="button"
                onClick={() => onPickMeal(seg.type)}
                aria-label={`${segmentAriaFact(seg)}. ${
                  isEmpty ? ADD_TO_MEAL[seg.type] : SHOW_MEAL[seg.type]
                }`}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-lg py-1 text-left",
                  // 44×44 під coarse pointer — сегмент найдрібніший
                  // тапабельний контрол hero.
                  "pointer-coarse:min-h-[44px]",
                  "hover:bg-line/40 focus-ring",
                )}
              >
                <span className="text-style-caption text-text truncate w-full">
                  {seg.label}
                </span>
                <span className="text-style-label font-semibold text-text tabular-nums truncate w-full">
                  {seg.kcal > 0 ? formatNumberUk(Math.round(seg.kcal)) : "—"}
                </span>
                {/* Частка прийому баром у hue модуля. Сегмент, що переводить
                    суму за норму, — чорнилом (рішення 5 спеки), не
                    небезпекою: канон Їжі лишає червоний лише для >110 %. */}
                <span
                  aria-hidden="true"
                  className="relative mt-1 block h-[3px] w-full rounded-[3px] bg-line"
                >
                  <span
                    data-testid="meal-strip-fill"
                    style={{ width: `${share}%` }}
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-[3px]",
                      isAccent ? "bg-text" : "bg-chart-nutrition",
                    )}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {incompleteNote && (
        <p className="text-style-caption text-text">{incompleteNote}</p>
      )}

      {goalKcal == null && onSetGoal && (
        <div>
          <Button variant="outline" size="md" onClick={onSetGoal}>
            {messages.nutrition.heroStrip.ctaSetGoal}
          </Button>
        </div>
      )}

      <ul
        aria-label={messages.nutrition.macrosToday}
        className="grid grid-cols-3 gap-3"
      >
        {macros.map((m) => {
          const unit = m.unit ?? "г";
          // Без цілі смуга лишається ПОРОЖНЬОЮ, а не повною.
          //
          // Тут стояло `m.consumed > 0 ? 100 : 0`, тобто 12 г білка без
          // заданої цілі малювали повний трек — візуальне «готово» там, де
          // готовності не існує, бо немає з чим порівнювати. Підпис поруч
          // це вже знав і чесно ховав знаменник (`m.goal > 0 ? " / N" : ""`),
          // тож смуга суперечила числу над собою (знахідка PR-N7, аудит
          // 2026-09-13). Порожній трек читається як «цілі немає», і це
          // правда; число поруч несе сам факт спожитого.
          const pct =
            m.goal > 0
              ? Math.min(100, Math.round((m.consumed / m.goal) * 100))
              : 0;
          const over = macroOverage(m.consumed, m.goal);
          return (
            <li key={m.label} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-1 text-style-caption text-text tabular-nums">
                <span>{m.label}</span>
                <span className="whitespace-nowrap">
                  {m.consumed}
                  {m.goal > 0 ? ` / ${m.goal}` : ""} {unit}
                  {over > 0 && (
                    <span className="ml-1 font-semibold">
                      +{formatNumberUk(Math.round(over))} {unit}
                    </span>
                  )}
                </span>
              </div>
              <div
                role="img"
                aria-label={
                  m.goal > 0
                    ? `${m.label}: ${m.consumed} з ${m.goal} ${unit}${
                        over > 0
                          ? `, на ${Math.round(over)} ${unit} понад ціль`
                          : ""
                      }`
                    : `${m.label}: ${m.consumed} ${unit}`
                }
                className="h-[3px] rounded-[3px] bg-line overflow-hidden"
              >
                <div
                  className="h-full rounded-[3px] bg-chart-nutrition motion-safe:transition-[width] motion-safe:duration-slow"
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
