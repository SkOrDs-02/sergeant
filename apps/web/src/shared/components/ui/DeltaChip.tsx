/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { formatNumberUk, NARROW_NBSP } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface DeltaChipProps {
  /** Поточне значення періоду. */
  cur: number;
  /** Значення попереднього періоду. */
  prev: number;
  /** Чи більше = краще (витрати — `false`). Керує лише кольором. */
  higherIsBetter?: boolean;
  /**
   * Одиниця абсолютної дельти. Коли задана, замість відсотка чип показує
   * різницю в цих одиницях («+480 ₴»). Викликач вирішує, коли відсоток не
   * має бази: для грошей Фініка це `compareAmounts` (Р4 — відсоток лише коли
   * попередня сума ≥ 10 % поточної). Без неї поведінка незмінна.
   */
  absoluteUnit?: string;
  className?: string;
}

/**
 * Чип зміни до попереднього періоду для звітних карток хабу.
 *
 * AI-CONTEXT: до 2026-09-01 ця функція жила чотирма копіями в
 * `FitnessCard` / `ExpensesCard` / `RoutineCard` / `NutritionCard`, і всі
 * чотири рендерили «▲ +0%» зеленим, коли `cur === prev` (`diff >= 0`
 * читало нуль як ріст). Канон hub-coach: Sergeant мовчить, коли руху немає,
 * тож нульова дельта — явна гілка без стрілки, а не окремий випадок
 * стрілки вгору. Анти-слоп аудит 2026-09-01, F4 / Q2.
 *
 * Стани:
 * - `prev === 0 && cur === 0` → нічого (порівнювати нема з чим);
 * - `prev === 0` → «—» (ріст від нуля не має відсотка);
 * - `cur === prev` → «без змін» нейтральним кольором, без стрілки;
 * - інакше → стрілка + знак + відсоток; колір за `higherIsBetter`.
 *
 * `absoluteUnit` замінює відсоток абсолютною різницею («+480 ₴»), решта
 * станів ті самі.
 */
export function DeltaChip({
  cur,
  prev,
  higherIsBetter = true,
  absoluteUnit,
  className,
}: DeltaChipProps) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0)
    return (
      <span className={cn("text-style-caption text-muted", className)}>—</span>
    );
  const diff = cur - prev;
  if (diff === 0) {
    return (
      <span
        className={cn("text-style-caption text-muted", className)}
        data-testid="delta-chip-flat"
      >
        {messages.hub.reportDeltaFlat}
      </span>
    );
  }
  const pct = Math.round((diff / prev) * 100);
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  const trendingUp = diff > 0;
  const label = absoluteUnit
    ? `${trendingUp ? "+" : "\u2212"}${formatNumberUk(Math.abs(Math.round(diff)))}${NARROW_NBSP}${absoluteUnit}`
    : `${trendingUp ? "+" : ""}${pct}%`;
  return (
    <span
      className={cn(
        "text-style-caption inline-flex items-center gap-0.5",
        positive
          ? "text-success-strong dark:text-success"
          : "text-danger-strong dark:text-danger",
        className,
      )}
      data-testid="delta-chip"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        {trendingUp ? <path d="M12 5l7 9H5z" /> : <path d="M12 19l-7-9h14z" />}
      </svg>
      {label}
    </span>
  );
}
