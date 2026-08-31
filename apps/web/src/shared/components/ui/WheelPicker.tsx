/**
 * Sergeant Design System — WheelPicker (R2-UI-18).
 *
 * iOS-style scroll-snap value wheel for choosing one value from a bounded,
 * discrete set. The centre row is the selected value; neighbours dim with
 * distance. Built as a genuine `role="spinbutton"` so keyboard and screen
 * reader users get first-class support without depending on scroll.
 *
 * Keyboard model:
 *   - `ArrowUp`   → next-larger value
 *   - `ArrowDown` → next-smaller value
 *   - `PageUp` / `PageDown` → ±5 steps
 *   - `Home` / `End` → first / last value
 *
 * Motion: honours `prefers-reduced-motion` — the scroll sync jumps
 * instantly instead of smooth-scrolling, and the per-row transition is
 * dropped. Touch scrolling still works (the browser owns snap physics);
 * we only avoid *programmatic* smooth scrolls.
 *
 * Controlled only: the parent owns `value`. If `value` isn't an exact
 * member of `values`, the nearest member is highlighted (useful when a
 * pre-existing free-form value is adopted into the wheel).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { useReducedMotion } from "@shared/hooks/useReducedMotion";
import { clampToDomain } from "@shared/charts/chartMath";

export interface WheelPickerProps {
  /** Ordered set of selectable values (ascending recommended). */
  values: readonly number[];
  /** Current value. Nearest member is highlighted if not an exact match. */
  value: number;
  /** Emitted when the settled value changes. */
  onChange: (value: number) => void;
  /** Row height in px. Default 40. */
  itemHeight?: number;
  /** Visible rows (odd number keeps the selection centred). Default 5. */
  visibleCount?: number;
  /** Disable interaction. */
  disabled?: boolean;
  /** Format a value for display + `aria-valuetext`. */
  formatValue?: (value: number) => string;
  /** Optional unit suffix rendered beside each row (e.g. "г"). */
  unit?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

function nearestIndex(values: readonly number[], target: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < values.length; i++) {
    const dist = Math.abs((values[i] ?? 0) - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function WheelPicker({
  values,
  value,
  onChange,
  itemHeight = 40,
  visibleCount = 5,
  disabled = false,
  formatValue,
  unit,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
}: WheelPickerProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = nearestIndex(values, value);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const containerHeight = itemHeight * visibleCount;
  const pad = (containerHeight - itemHeight) / 2;

  const fmt = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );

  const commit = useCallback(
    (index: number) => {
      const next = values[clampToDomain(index, 0, values.length - 1)];
      if (next !== undefined && next !== value) onChange(next);
    },
    [onChange, value, values],
  );

  // Sync scroll position to the controlled value (also positions on mount).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setActiveIndex(selectedIndex);
    const top = selectedIndex * itemHeight;
    if (Math.abs(el.scrollTop - top) > 1) {
      // `scrollTo` is absent in jsdom and very old engines — fall back to
      // assigning scrollTop so the sync still lands on the right row.
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      } else {
        el.scrollTop = top;
      }
    }
  }, [selectedIndex, itemHeight, reduced]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || disabled) return;
    const i = clampToDomain(
      Math.round(el.scrollTop / itemHeight),
      0,
      values.length - 1,
    );
    if (i !== activeIndex) setActiveIndex(i);
    // Commit only once the scroll settles so mid-flick rows don't spam the
    // parent with intermediate values.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => commit(i), 120);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowUp":
        nextIndex = selectedIndex + 1;
        break;
      case "ArrowDown":
        nextIndex = selectedIndex - 1;
        break;
      case "PageUp":
        nextIndex = selectedIndex + 5;
        break;
      case "PageDown":
        nextIndex = selectedIndex - 5;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = values.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    commit(nextIndex);
  };

  const selectedValue = values[selectedIndex];

  return (
    <div
      className={cn(
        "relative select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height: containerHeight, width: "100%" }}
    >
      {/* Centre selection band */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border-y border-brand-strong/40 bg-brand-strong/5"
        style={{ height: itemHeight }}
      />
      {/* Fade masks */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-bg to-transparent"
        style={{ height: pad }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg to-transparent"
        style={{ height: pad }}
      />
      <div
        ref={scrollRef}
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        aria-valuenow={selectedValue}
        aria-valuetext={
          selectedValue !== undefined ? fmt(selectedValue) : undefined
        }
        aria-label={ariaLabel && !ariaLabelledBy ? ariaLabel : undefined}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled || undefined}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className={cn(
          "h-full overflow-y-auto no-scrollbar snap-y snap-mandatory outline-none",
          "focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-xl",
          disabled && "overflow-hidden",
        )}
        style={{ scrollPaddingTop: pad }}
      >
        <div style={{ height: pad }} aria-hidden="true" />
        {values.map((v, i) => {
          const dist = Math.abs(i - activeIndex);
          const isSelected = i === activeIndex;
          return (
            <div
              key={v}
              aria-hidden="true"
              className={cn(
                "snap-center flex items-center justify-center gap-1 tabular-nums",
                !reduced && "transition-all duration-fast",
                isSelected ? "text-text text-style-title" : "text-muted",
              )}
              style={{
                height: itemHeight,
                opacity: isSelected ? 1 : Math.max(0.25, 1 - dist * 0.28),
              }}
            >
              {fmt(v)}
              {unit ? (
                <span className="text-style-caption text-muted">{unit}</span>
              ) : null}
            </div>
          );
        })}
        <div style={{ height: pad }} aria-hidden="true" />
      </div>
    </div>
  );
}
