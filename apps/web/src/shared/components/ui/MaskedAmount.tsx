/**
 * Sergeant Design System — MaskedAmount (#9 blur-to-reveal)
 *
 * Privacy affordance for monetary values. Replaces the old "hide behind
 * `••••`" pattern: instead of erasing the number (which leaves an empty,
 * uninformative slot), the real value stays in place but is blurred, and a
 * tap peeks it for a couple of seconds before it re-hides itself.
 *
 * Two modes:
 *   - interactive (default) — renders a <button>; tap toggles a temporary
 *     reveal (auto re-hides after REVEAL_MS). Use where the value is NOT
 *     already inside another interactive element (e.g. the amount column of
 *     a transaction row).
 *   - static (`interactive={false}`) — renders a blurred <span> with an
 *     sr-only label and no tap handler. Use inside an existing button/link
 *     (e.g. the day-group header, which is itself a collapse toggle) to
 *     avoid nesting interactive elements.
 *
 * When `masked` is false the component is transparent — it renders the
 * formatted string exactly as a plain <span>, so callers can always wrap
 * their amounts unconditionally.
 *
 * Motion: the blur→sharp transition is gated behind `motion-safe`, so users
 * with `prefers-reduced-motion: reduce` get an instant swap with no easing.
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { useHaptic } from "@shared/hooks/useHaptic";

/** How long a tap-peek stays revealed before auto-hiding again. */
const REVEAL_MS = 2500;
/** Blur radius applied to a masked value, in px. */
const BLUR_PX = 5;

export interface MaskedAmountProps {
  /** Pre-formatted amount string, e.g. "−1 234,00 ₴". */
  children: string;
  /** When true, hide the value behind a blur until revealed. */
  masked: boolean;
  /**
   * Allow tap-to-reveal. Set `false` when the amount lives inside another
   * interactive element (nesting buttons is invalid) — renders a static
   * blurred span instead.
   */
  interactive?: boolean;
  /** Accessible noun for the value. Default "сума". */
  label?: string;
  className?: string;
}

function MaskedAmountImpl({
  children,
  masked,
  interactive = true,
  label = "сума",
  className,
}: MaskedAmountProps) {
  const [revealed, setRevealed] = useState(false);
  const haptic = useHaptic();
  const timerRef = useRef<number | null>(null);

  // Auto re-hide a tap-peek after REVEAL_MS.
  useEffect(() => {
    if (!revealed) return undefined;
    timerRef.current = window.setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [revealed]);

  // If the global mask toggles off, drop any local peek so the two states
  // never disagree.
  useEffect(() => {
    if (!masked) setRevealed(false);
  }, [masked]);

  const toggle = useCallback(
    (e: MouseEvent) => {
      // The amount often sits inside a clickable row — don't trigger the
      // row's onClick when the user only wants to peek the value.
      e.stopPropagation();
      haptic.tap();
      setRevealed((v) => !v);
    },
    [haptic],
  );

  // Not masked → fully transparent passthrough.
  if (!masked) {
    return <span className={cn("tabular-nums", className)}>{children}</span>;
  }

  const blurred = !revealed;
  const blurStyle = { filter: blurred ? `blur(${BLUR_PX}px)` : undefined };

  // Static variant — blurred span, no interactivity (safe inside a button).
  if (!interactive) {
    return (
      <span
        className={cn(
          "tabular-nums motion-safe:transition motion-safe:duration-200",
          blurred && "select-none",
          className,
        )}
        style={blurStyle}
      >
        <span aria-hidden={blurred}>{children}</span>
        {blurred && <span className="sr-only">Прихована {label}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        revealed
          ? `${label} показана, натисніть щоб приховати`
          : `Прихована ${label}, натисніть щоб показати`
      }
      className={cn(
        "tabular-nums cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit",
        "rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "motion-safe:transition motion-safe:duration-200",
        blurred && "select-none",
        className,
      )}
      style={blurStyle}
    >
      <span aria-hidden={blurred}>{children}</span>
    </button>
  );
}

export const MaskedAmount = memo(MaskedAmountImpl);
