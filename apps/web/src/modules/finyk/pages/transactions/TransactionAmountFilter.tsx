import { useId } from "react";
import { formatMoney } from "@sergeant/shared";
import { Slider } from "@shared/components/ui/Slider";

export interface TransactionAmountFilterProps {
  /** Full `[min, max]` span (absolute UAH) derived from the month's rows. */
  bounds: readonly [number, number];
  /** Active range, or `null` when the filter is inactive (full span). */
  value: readonly [number, number] | null;
  /** Emit a clamped range, or `null` to clear the filter. */
  onChange: (next: readonly [number, number] | null) => void;
}

/**
 * UI-16 · Dual-range amount filter for the Transactions list.
 *
 * Thin wrapper around the design-system {@link Slider} in `range` mode.
 * The hook (`useTransactionFilters`) owns the state and bounds; this
 * component only renders the control and translates "range equals the
 * full span" into `null` (inactive) so an untouched slider never hides
 * rows.
 *
 * Rendered only when the span is meaningful (`max > min`) — a month with
 * zero or a single amount has nothing to slice, so the caller skips it.
 */
export function TransactionAmountFilter({
  bounds,
  value,
  onChange,
}: TransactionAmountFilterProps) {
  const labelId = useId();
  const [minBound, maxBound] = bounds;
  const active = value !== null;
  const current: readonly [number, number] = value ?? [minBound, maxBound];

  // A single "nice" step: 1% of the span, floored to at least 1 UAH so the
  // keyboard/pointer increments stay usable across both small and large
  // months.
  const step = Math.max(1, Math.round((maxBound - minBound) / 100));

  const fmt = (n: number) => formatMoney(n, { maxFractionDigits: 0 });

  const handleChange = (next: readonly [number, number]) => {
    // Treat "back to the full span" as clearing the filter so the pill
    // strip and this control agree on what "no filter" means.
    if (next[0] <= minBound && next[1] >= maxBound) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  return (
    <div data-no-swipe className="rounded-2xl border border-line bg-panelHi px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-style-caption font-medium text-text">
          Сума
        </span>
        <div className="flex items-center gap-2">
          <span className="text-style-caption tabular-nums text-muted">
            {active ? `${fmt(current[0])} – ${fmt(current[1])}` : "будь-яка"}
          </span>
          {active && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-style-caption font-medium text-finyk underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-finyk/50 rounded"
            >
              Скинути
            </button>
          )}
        </div>
      </div>
      <Slider
        range
        min={minBound}
        max={maxBound}
        step={step}
        value={current}
        onChange={handleChange}
        showTooltip
        formatValue={fmt}
        aria-labelledby={labelId}
        className="mt-1"
      />
    </div>
  );
}
