import { useEffect, useMemo, useRef } from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  getKyivDateParts,
  getKyivDayKey,
  parseKyivDate,
} from "@shared/lib/time/kyivTime";

/**
 * DateScrubber (UI-12)
 * ────────────────────
 * Horizontal strip of large, thumb-sized day targets for picking a recent
 * date without opening the OS date sheet. Replaces the "tap a native
 * `type=date` field" flow for the common case of logging something that
 * happened in the last couple of weeks.
 *
 * Design intent:
 *  - Targets are ≥44px tall (Apple HIG / Material touch minimum).
 *  - The selected day auto-scrolls into view and is announced.
 *  - Days render oldest→newest so "Сьогодні" sits at the right edge under
 *    the thumb; scrolling left reaches older days.
 *  - All day math goes through the Kyiv-time helpers so day boundaries match
 *    the rest of the app regardless of the device's clock/timezone.
 *  - Purely value in / value out (Kyiv day-key `YYYY-MM-DD`); the host owns
 *    state, so it drops into react-hook-form, a draft reducer, or local
 *    state.
 */

const WEEKDAYS_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateScrubberProps {
  /** Selected day as Kyiv day-key `YYYY-MM-DD`. */
  value: string;
  onChange: (dayKey: string) => void;
  /** How many days back to render (default 14). */
  days?: number;
  /** Optional class hook for module theming. */
  className?: string;
  "aria-label"?: string;
}

export function DateScrubber({
  value,
  onChange,
  days = 14,
  className,
  "aria-label": ariaLabel = "Вибір дати",
}: DateScrubberProps) {
  const todayKey = getKyivDayKey();

  // Build the day list once per `days` change: oldest → newest so the last
  // (rightmost) chip is today, matching the natural "scroll back in time"
  // reading direction. Anchored to Kyiv midnight, then stepped by whole days.
  const items = useMemo(() => {
    const out: { key: string; weekday: number; day: number }[] = [];
    const anchor = parseKyivDate(todayKey);
    if (!anchor) return out;
    for (let i = days - 1; i >= 0; i--) {
      const at = anchor.getTime() - i * DAY_MS;
      const parts = getKyivDateParts(at);
      out.push({ key: getKyivDayKey(at), weekday: parts.weekday, day: parts.day });
    }
    return out;
  }, [days, todayKey]);

  const selectedRef = useRef<HTMLButtonElement>(null);

  // Keep the active day visible whenever the value changes (including the
  // initial mount, where today sits at the far right edge).
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [value]);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1",
        "snap-x snap-mandatory scroll-px-1",
        className,
      )}
    >
      {items.map(({ key, weekday, day }) => {
        const selected = key === value;
        const isToday = key === todayKey;
        const label = WEEKDAYS_UK[weekday] ?? "";
        return (
          <button
            key={key}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={isToday ? `Сьогодні, ${day}` : `${label}, ${day}`}
            onClick={() => onChange(key)}
            className={cn(
              "snap-end shrink-0 flex flex-col items-center justify-center gap-0.5",
              "min-w-[3rem] min-h-[3.25rem] rounded-xl px-2 py-1.5",
              "border transition-colors focus-ring",
              selected
                ? "bg-accent text-bg border-transparent font-semibold"
                : "bg-panel text-text border-line hover:bg-panelHi",
            )}
          >
            <span
              className={cn(
                "text-2xs",
                selected ? "text-bg/80" : "text-muted",
              )}
            >
              {isToday ? "Сьог" : label}
            </span>
            <span className="text-style-body tabular-nums leading-none">
              {day}
            </span>
          </button>
        );
      })}
    </div>
  );
}
