/**
 * Last validated: 2026-09-01
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
 * A11y: увесь візуал (сегменти + головне число) — один `role="img"` з
 * одним `aria-label`, внутрішній DOM `aria-hidden` (сегменти самі не
 * фокусуються). CTA «Задати норму» і нотатка про неповний день/оцінку
 * фото лишаються ЗА межами цього блоку — кнопка не може бути
 * `aria-hidden`, а текстові нотатки не дублюють inline-приклад aria-label
 * зі спеки.
 *
 * Ширина сегмента: `flexGrow` = ккал прийому (мінімум 0.0001, щоб
 * порожній тип не забирав пропорційну частку), `min-width: 12px` —
 * підлога читабельності (спека, ризик 1). Підписи прийомів НЕ лежать
 * усередині вузького бару (ризик 2 — вони б обрізались при 4
 * заповнених сегментах): окремий рядок з чотирма РІВНИМИ колонками
 * знизу несе і назву, і ккал, і завжди має однакову ширину незалежно
 * від пропорції бару над ним.
 */
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import type { MealTypeId } from "@sergeant/nutrition-domain";
import { REMAINING_TODAY_LABEL } from "../lib/nextMealLabel";

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

function buildAriaLabel(
  segments: readonly MealStripSegment[],
  goalKcal: number | null,
  remaining: number | null,
  remainingLabel: string,
): string {
  const parts = segments.map((s) =>
    s.kcal > 0
      ? `${s.label.toLowerCase()} ${Math.round(s.kcal)} ккал`
      : ARIA_NOT_RECORDED[s.type],
  );
  if (goalKcal != null && remaining != null) {
    if (remaining < 0) {
      parts.push(`${Math.round(Math.abs(remaining))} ккал понад норму`);
    } else if (remainingLabel === REMAINING_TODAY_LABEL) {
      parts.push(`лишилось ${Math.round(remaining)} ккал сьогодні`);
    } else if (remainingLabel.startsWith(REMAINING_ON_PREFIX)) {
      const suffix = remainingLabel.slice(REMAINING_ON_PREFIX.length);
      parts.push(`лишилось ${Math.round(remaining)} ккал на ${suffix}`);
    } else {
      parts.push(remainingLabel);
    }
  }
  const sentence = parts.join(", ");
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
  incompleteNote,
}: MealStripProps) {
  const total = segments.reduce((sum, s) => sum + s.kcal, 0);
  const remaining = goalKcal != null ? goalKcal - total : null;
  const accentIndex = findAccentIndex(segments, goalKcal);
  const ariaLabel = buildAriaLabel(
    segments,
    goalKcal,
    remaining,
    remainingLabel,
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={ariaLabel} className="flex flex-col gap-1.5">
        {/* Row 1 — proportional bars. Purely decorative colour/width signal;
            no text inside so a very narrow segment (risk: перекус 50 ккал на
            2200) never clips a label. */}
        <div
          aria-hidden="true"
          data-testid="meal-strip-bars"
          className="flex items-stretch gap-1 h-7"
        >
          {segments.map((seg, i) => {
            const isEmpty = seg.kcal <= 0;
            const isAccent = accentIndex === i;
            return (
              <div
                key={seg.type}
                style={{
                  flexGrow: total > 0 ? Math.max(seg.kcal, 0.0001) : 1,
                  flexBasis: 0,
                }}
                className={cn(
                  "min-w-[12px] rounded-lg border",
                  isEmpty
                    ? "bg-hero-ink/10 border-hero-ink/20"
                    : isAccent
                      ? "bg-nutrition border-hero-ink/20"
                      : "bg-hero-ink/30 border-hero-ink/20",
                )}
              />
            );
          })}
        </div>

        {/* Row 2 — always-equal-width captions, decoupled from the bar's
            proportional width above (risk 2: 4 filled labels at 393px). */}
        <div aria-hidden="true" className="grid grid-cols-4 gap-1">
          {segments.map((seg) => (
            <div
              key={seg.type}
              className="flex flex-col items-center text-center"
            >
              <span className="text-style-caption text-hero-ink/90 truncate w-full">
                {seg.label}
              </span>
              <span className="text-style-caption text-hero-ink tabular-nums truncate w-full">
                {seg.kcal > 0 ? Math.round(seg.kcal) : "—"}
              </span>
            </div>
          ))}
        </div>

        {goalKcal != null && remaining != null && (
          <div className="mt-1 flex flex-col items-center gap-0.5 text-center">
            {remaining < 0 ? (
              <>
                <p className="text-style-display text-hero-ink tabular-nums">
                  −{Math.round(Math.abs(remaining))}
                </p>
                <p className="text-style-caption text-hero-ink">
                  {messages.nutrition.heroStrip.overshootSuffix}
                </p>
              </>
            ) : (
              <>
                <p className="text-style-display text-hero-ink tabular-nums">
                  {Math.round(remaining)}{" "}
                  <span className="text-style-caption text-hero-ink">
                    {messages.nutrition.heroStrip.kcalUnit}
                  </span>
                </p>
                <p className="text-style-caption text-hero-ink">
                  {remainingLabel}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {incompleteNote && (
        <p className="text-style-caption text-hero-ink/80 text-center">
          {incompleteNote}
        </p>
      )}

      {goalKcal == null && onSetGoal && (
        <div className="flex justify-center">
          <Button variant="nutrition" size="md" onClick={onSetGoal}>
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
