import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — Slider.
 *
 * Token-styled single-value and range slider with full keyboard
 * support and an optional value tooltip. Built on top of two
 * `role="slider"` thumb elements so the WAI-ARIA semantics are
 * correct without depending on a third-party primitive.
 *
 * Keyboard model (each thumb):
 *
 *   - `ArrowRight` / `ArrowUp`     +1 step
 *   - `ArrowLeft`  / `ArrowDown`   −1 step
 *   - `Shift` + arrow              ×10 step
 *   - `PageUp` / `PageDown`        ±10 % of (max − min)
 *   - `Home` / `End`               min / max
 *
 * Vertical orientation is opt-in (`orientation="vertical"`). When
 * vertical, "up" maps to "more" so the keyboard direction matches the
 * visual axis.
 *
 * Controlled and uncontrolled. For single mode, `value` is a number;
 * for `range` mode, `value` is a `[min, max]` tuple — values cannot
 * cross.
 */

export type SliderSize = "sm" | "md";
export type SliderOrientation = "horizontal" | "vertical";

type RangeValue = readonly [number, number];

interface BaseSliderProps {
  /** Inclusive minimum. */
  min?: number;
  /** Inclusive maximum. */
  max?: number;
  /** Step size for keyboard / pointer increments. */
  step?: number;
  /** Token-sized track thickness. `sm` 4 px / `md` 6 px. */
  size?: SliderSize;
  /** Orientation. `vertical` rotates the track and inverts axis. */
  orientation?: SliderOrientation;
  /** Disable interaction entirely. */
  disabled?: boolean;
  /** Tick mark positions. Rendered as small dots under the track. */
  ticks?: ReadonlyArray<number>;
  /** Show a value bubble above the focused / dragged thumb. */
  showTooltip?: boolean;
  /** Format a value for display (tooltip + ARIA `aria-valuetext`).
   *  Defaults to a plain number. */
  formatValue?: (value: number) => string;
  /** Accessible name. Required when no visible label is wired
   *  through `aria-labelledby`. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export interface SingleSliderProps extends BaseSliderProps {
  range?: false;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
}

export interface RangeSliderProps extends BaseSliderProps {
  range: true;
  value?: RangeValue;
  defaultValue?: RangeValue;
  onChange?: (value: RangeValue) => void;
  onChangeEnd?: (value: RangeValue) => void;
}

export type SliderProps = SingleSliderProps | RangeSliderProps;

const trackThickness: Record<SliderSize, string> = {
  sm: "h-1",
  md: "h-1.5",
};

const trackThicknessVertical: Record<SliderSize, string> = {
  sm: "w-1",
  md: "w-1.5",
};

const thumbSize: Record<SliderSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToStep(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  const stepped = Math.round((value - min) / step) * step + min;
  // Avoid floating-point drift like `0.1 + 0.2` for nice display.
  const decimals = (step.toString().split(".")[1] ?? "").length;
  return Number(stepped.toFixed(decimals));
}

function isRangeValue(value: number | RangeValue): value is RangeValue {
  return Array.isArray(value);
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(
  function Slider(props, ref) {
    const {
      min = 0,
      max = 100,
      step = 1,
      size = "md",
      orientation = "horizontal",
      disabled = false,
      ticks,
      showTooltip = false,
      formatValue,
      className,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
    } = props;

    const isRange = props.range === true;
    const trackRef = useRef<HTMLDivElement | null>(null);
    const generatedId = useId();
    const uid = generatedId;
    const isVertical = orientation === "vertical";

    // ── State ────────────────────────────────────────────────────────────
    const defaultSingle =
      !isRange && (props as SingleSliderProps).defaultValue !== undefined
        ? (props as SingleSliderProps).defaultValue!
        : min;
    const defaultRange: RangeValue =
      isRange && (props as RangeSliderProps).defaultValue !== undefined
        ? (props as RangeSliderProps).defaultValue!
        : ([min, max] as RangeValue);

    const [internalSingle, setInternalSingle] = useState<number>(defaultSingle);
    const [internalRange, setInternalRange] =
      useState<RangeValue>(defaultRange);

    const controlledValue = isRange
      ? (props as RangeSliderProps).value
      : (props as SingleSliderProps).value;
    const isControlled = controlledValue !== undefined;

    const currentValue: number | RangeValue = isRange
      ? ((isControlled
          ? (controlledValue as RangeValue)
          : internalRange) as RangeValue)
      : isControlled
        ? (controlledValue as number)
        : internalSingle;

    const [activeThumb, setActiveThumb] = useState<0 | 1 | null>(null);
    const [tooltipThumb, setTooltipThumb] = useState<0 | 1 | null>(null);

    // ── Helpers ──────────────────────────────────────────────────────────
    const fmt = useCallback(
      (n: number) => (formatValue ? formatValue(n) : String(n)),
      [formatValue],
    );

    const commit = useCallback(
      (next: number | RangeValue, end = false) => {
        if (isRange) {
          const nv = next as RangeValue;
          if (!isControlled) setInternalRange(nv);
          (props as RangeSliderProps).onChange?.(nv);
          if (end) (props as RangeSliderProps).onChangeEnd?.(nv);
        } else {
          const nv = next as number;
          if (!isControlled) setInternalSingle(nv);
          (props as SingleSliderProps).onChange?.(nv);
          if (end) (props as SingleSliderProps).onChangeEnd?.(nv);
        }
      },
      [isControlled, isRange, props],
    );

    const valueAt = useCallback(
      (thumb: 0 | 1): number => {
        if (isRangeValue(currentValue)) return currentValue[thumb];
        return currentValue;
      },
      [currentValue],
    );

    const updateThumb = useCallback(
      (thumb: 0 | 1, rawValue: number, end = false) => {
        const snapped = clamp(snapToStep(rawValue, min, step), min, max);
        if (isRange) {
          const [lo, hi] = currentValue as RangeValue;
          const next: RangeValue =
            thumb === 0
              ? ([Math.min(snapped, hi), hi] as RangeValue)
              : ([lo, Math.max(snapped, lo)] as RangeValue);
          if (next[0] !== lo || next[1] !== hi || end) commit(next, end);
        } else {
          const single = currentValue as number;
          if (snapped !== single || end) commit(snapped, end);
        }
      },
      [commit, currentValue, isRange, max, min, step],
    );

    // ── Pointer drag ─────────────────────────────────────────────────────
    const positionToValue = useCallback(
      (clientX: number, clientY: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return min;
        const fraction = isVertical
          ? 1 - (clientY - rect.top) / Math.max(rect.height, 1)
          : (clientX - rect.left) / Math.max(rect.width, 1);
        return min + clamp(fraction, 0, 1) * (max - min);
      },
      [isVertical, max, min],
    );

    const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const raw = positionToValue(e.clientX, e.clientY);
      // Pick the closer thumb in range mode; otherwise it's always thumb 0.
      let thumb: 0 | 1 = 0;
      if (isRange) {
        const [lo, hi] = currentValue as RangeValue;
        thumb = Math.abs(raw - lo) <= Math.abs(raw - hi) ? 0 : 1;
      }
      setActiveThumb(thumb);
      setTooltipThumb(thumb);
      updateThumb(thumb, raw);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    };

    const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activeThumb === null || disabled) return;
      const raw = positionToValue(e.clientX, e.clientY);
      updateThumb(activeThumb, raw);
    };

    const onTrackPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activeThumb === null) return;
      const raw = positionToValue(e.clientX, e.clientY);
      updateThumb(activeThumb, raw, true);
      setActiveThumb(null);
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* releasePointerCapture can throw if the capture was already lost. */
      }
    };

    // ── Keyboard ─────────────────────────────────────────────────────────
    const onThumbKeyDown = useCallback(
      (thumb: 0 | 1, e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        const current = valueAt(thumb);
        const span = max - min;
        const big = step * 10;
        const page = Math.max(step, span / 10);
        let next: number | null = null;
        const shift = e.shiftKey;
        switch (e.key) {
          case "ArrowRight":
          case "ArrowUp":
            next = current + (shift ? big : step);
            break;
          case "ArrowLeft":
          case "ArrowDown":
            next = current - (shift ? big : step);
            break;
          case "PageUp":
            next = current + page;
            break;
          case "PageDown":
            next = current - page;
            break;
          case "Home":
            next = min;
            break;
          case "End":
            next = max;
            break;
          default:
            return;
        }
        e.preventDefault();
        updateThumb(thumb, next, true);
      },
      [disabled, max, min, step, updateThumb, valueAt],
    );

    // Release tooltip when focus leaves both thumbs.
    useEffect(() => {
      if (activeThumb !== null) setTooltipThumb(activeThumb);
    }, [activeThumb]);

    // ── Render ───────────────────────────────────────────────────────────
    const percent = (n: number) => ((n - min) / Math.max(1, max - min)) * 100;
    const [valA, valB] = isRange
      ? (currentValue as RangeValue)
      : [currentValue as number, null];

    const lower = isRange ? percent(valA!) : 0;
    const upper = isRange ? percent(valB!) : percent(valA!);

    const renderThumb = (thumb: 0 | 1) => {
      const v = valueAt(thumb);
      const pct = percent(v);
      const positionStyle = isVertical
        ? { bottom: `calc(${pct}% - ${size === "sm" ? 8 : 10}px)` }
        : { left: `calc(${pct}% - ${size === "sm" ? 8 : 10}px)` };
      const focused = tooltipThumb === thumb;

      return (
        <div
          key={thumb}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-orientation={orientation}
          aria-disabled={disabled || undefined}
          aria-valuemin={isRange && thumb === 1 ? valA! : min}
          aria-valuemax={isRange && thumb === 0 ? valB! : max}
          aria-valuenow={v}
          aria-valuetext={formatValue ? fmt(v) : undefined}
          aria-label={ariaLabel && !ariaLabelledBy ? ariaLabel : undefined}
          aria-labelledby={ariaLabelledBy}
          onKeyDown={(e) => onThumbKeyDown(thumb, e)}
          onFocus={() => setTooltipThumb(thumb)}
          onBlur={() => {
            if (activeThumb === null) setTooltipThumb(null);
          }}
          style={positionStyle}
          className={cn(
            "absolute rounded-full bg-panel border-2 border-brand-strong shadow-card",
            "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "touch-none",
            thumbSize[size],
            disabled && "cursor-not-allowed opacity-60",
            !disabled && "cursor-grab active:cursor-grabbing",
          )}
        >
          {showTooltip && focused && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 -translate-x-1/2 pointer-events-none",
                "px-2 py-0.5 rounded-md text-2xs font-medium tabular-nums",
                "bg-text text-bg shadow-card whitespace-nowrap",
                isVertical
                  ? "right-full mr-3 top-1/2 -translate-y-1/2"
                  : "bottom-full mb-2",
              )}
            >
              {fmt(v)}
            </span>
          )}
        </div>
      );
    };

    const filledStyle: React.CSSProperties = isVertical
      ? { bottom: `${lower}%`, top: `${100 - upper}%` }
      : { left: `${lower}%`, right: `${100 - upper}%` };

    const tickKey = ticks ? ticks.join("|") : "";

    return (
      <div
        ref={ref}
        className={cn(
          "relative select-none",
          isVertical ? "h-40 inline-flex" : "w-full",
          disabled && "opacity-60",
          className,
        )}
        data-slider-id={uid}
      >
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          className={cn(
            "relative rounded-full bg-line",
            isVertical
              ? cn(trackThicknessVertical[size], "h-full mx-auto")
              : cn(trackThickness[size], "w-full my-3"),
            !disabled && "cursor-pointer",
          )}
        >
          <div
            aria-hidden="true"
            className="absolute rounded-full bg-brand-strong"
            style={{
              ...filledStyle,
              ...(isVertical ? { left: 0, right: 0 } : { top: 0, bottom: 0 }),
            }}
          />
          {ticks && ticks.length > 0 && (
            <div
              aria-hidden="true"
              key={tickKey}
              className="absolute inset-0 pointer-events-none"
            >
              {ticks.map((t) => {
                const pct = percent(t);
                return (
                  <span
                    key={t}
                    className={cn(
                      "absolute block rounded-full bg-muted/60",
                      isVertical
                        ? "w-1 h-1 left-1/2 -translate-x-1/2"
                        : "w-1 h-1 top-1/2 -translate-y-1/2",
                    )}
                    style={
                      isVertical
                        ? { bottom: `calc(${pct}% - 2px)` }
                        : { left: `calc(${pct}% - 2px)` }
                    }
                  />
                );
              })}
            </div>
          )}
          {renderThumb(0)}
          {isRange && renderThumb(1)}
        </div>
      </div>
    );
  },
);

Slider.displayName = "Slider";

export function SliderTicks({ children }: { children?: ReactNode }) {
  // Reserved for future composition: a `<SliderTicks>` slot that
  // consumers can render below the track for custom tick labels.
  return <>{children}</>;
}
