import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import {
  useToast,
  type ToastItem,
  type ToastType,
} from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import { Icon, type IconName } from "./Icon";
import { messages } from "@shared/i18n/uk";

// «Чорнило» v3.1 § 5 — hybrid toast, not a full saturated fill. Base is the
// same `surface-hi` (#17231d dark / #faf7f0 light) + `text-ink` for every
// type; only the left stripe, icon, and Undo-action carry the semantic
// colour. Error additionally gets a full-perimeter `danger/35` border
// instead of the neutral `line/8` hairline. Colour-coding reads from the
// stripe + icon alone — a saturated fill is no longer needed.
const BASE = "bg-panelHi text-ink";

const BORDER: Record<ToastType, string> = {
  success: "border border-line/8",
  error: "border border-danger/35",
  warning: "border border-line/8",
  info: "border border-line/8",
};

// Semantic accent — light uses the AA `-strong` tier, dark the
// luminescent tier-400 shade (spec eталон: success #34d399, error
// #f87171 — Tailwind's own emerald-400/red-400, so no new token needed).
const ACCENT_TEXT: Record<ToastType, string> = {
  success: "text-success-strong dark:text-emerald-400",
  error: "text-danger-strong dark:text-red-400",
  warning: "text-warning-strong dark:text-amber-400",
  info: "text-info-strong dark:text-sky-400",
};

const ACCENT_STRIPE: Record<ToastType, string> = {
  success: "bg-success-strong dark:bg-emerald-400",
  error: "bg-danger-strong dark:bg-red-400",
  warning: "bg-warning-strong dark:bg-amber-400",
  info: "bg-info-strong dark:bg-sky-400",
};

const ICON_WRAP: Record<ToastType, string> = {
  success: "motion-safe:animate-check-pop",
  error: "",
  warning: "",
  info: "",
};

const ICON_NAME: Record<ToastType, IconName> = {
  success: "check",
  error: "x-circle",
  warning: "alert-triangle",
  info: "alert-circle",
};

/**
 * Countdown progress bar for toasts that own a recoverable side-effect
 * (the undo-pattern). Tints with the same semantic accent as the stripe/
 * icon, at low opacity, so it reads as part of the same colour signal
 * rather than a fifth arbitrary tone.
 */
const COUNTDOWN_BAR_TINT: Record<ToastType, string> = {
  success: "bg-success-strong/45 dark:bg-emerald-400/45",
  error: "bg-danger-strong/45 dark:bg-red-400/45",
  warning: "bg-warning-strong/45 dark:bg-amber-400/45",
  info: "bg-info-strong/45 dark:bg-sky-400/45",
};

/**
 * Horizontal-swipe threshold for touch-dismiss. 64 px is large enough that
 * users won't trigger it on a vertical scroll-start (where the X-component
 * of the gesture is small), and small enough that a casual flick clears the
 * toast without forcing a full-width drag. Velocity threshold catches fast
 * flicks that don't travel the full 64 px before lift-off — but only when
 * the gesture covered at least half the distance threshold, so micro-jitter
 * (a 5-px movement in 10 ms produces a 0.5 px/ms velocity that would
 * otherwise look like a flick) cannot trigger a phantom dismiss.
 */
const SWIPE_DISMISS_DISTANCE_PX = 64;
const SWIPE_DISMISS_MIN_DISTANCE_FOR_VELOCITY_PX = 32;
const SWIPE_DISMISS_VELOCITY_PX_PER_MS = 0.4;

interface ToastRowProps {
  toast: ToastItem;
  dismiss: (id: number) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
}

function ToastRow({ toast, dismiss, pause, resume }: ToastRowProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // `paused` is `true` whenever the auto-dismiss timer is currently halted
  // (hover, focus, or active touch-drag). Surfaced as state — rather than a
  // ref — because the CSS countdown animation reads it via
  // `[animation-play-state:paused]` and so needs a re-render when it flips.
  const [paused, setPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef(0);

  const hasAction = !!toast.action?.onClick;
  // Error toasts and undo-bearing toasts use `assertive` politeness so the
  // screen-reader interrupts whatever is being read — the user has at most
  // `toast.duration` ms (5 s for undo) to react, so we can't wait for the
  // queue to drain naturally.
  const assertive = toast.type === "error" || hasAction;

  const isLeaving = !!toast.leaving;

  const [prevIsLeaving, setPrevIsLeaving] = useState(isLeaving);
  if (isLeaving && !prevIsLeaving) {
    setPrevIsLeaving(true);
    setDragX(0);
    setDragging(false);
  } else if (!isLeaving && prevIsLeaving) {
    setPrevIsLeaving(false);
  }

  const onMouseEnter = useCallback(() => {
    setPaused(true);
    pause(toast.id);
  }, [pause, toast.id]);

  const onMouseLeave = useCallback(() => {
    setPaused(false);
    resume(toast.id);
  }, [resume, toast.id]);

  const onFocus = useCallback(() => {
    setPaused(true);
    pause(toast.id);
  }, [pause, toast.id]);

  const onBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (event.currentTarget.contains(next)) return;
      setPaused(false);
      resume(toast.id);
    },
    [resume, toast.id],
  );

  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchStartXRef.current = touch.clientX;
      touchStartTimeRef.current = Date.now();
      setDragging(true);
      setPaused(true);
      pause(toast.id);
    },
    [pause, toast.id],
  );

  const onTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current == null) return;
    const touch = event.touches[0];
    if (!touch) return;
    setDragX(touch.clientX - touchStartXRef.current);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (touchStartXRef.current == null) return;
    const dx = dragX;
    const dt = Math.max(1, Date.now() - touchStartTimeRef.current);
    const velocity = Math.abs(dx) / dt;
    touchStartXRef.current = null;
    setDragging(false);
    const flick =
      Math.abs(dx) >= SWIPE_DISMISS_MIN_DISTANCE_FOR_VELOCITY_PX &&
      velocity >= SWIPE_DISMISS_VELOCITY_PX_PER_MS;
    if (Math.abs(dx) >= SWIPE_DISMISS_DISTANCE_PX || flick) {
      // Treat horizontal swipe-dismiss as a deliberate "I've read this"
      // gesture. For undo-toasts this is equivalent to letting the 5 s
      // timer expire — the snapshot is dropped and `onUndo` never runs.
      dismiss(toast.id);
      return;
    }
    setDragX(0);
    setPaused(false);
    resume(toast.id);
  }, [dismiss, dragX, resume, toast.id]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape") return;
      // Only swallow Esc when the focus is inside this toast — leaves the
      // global `Esc` handler (modals, dialogs) untouched for other UIs.
      event.stopPropagation();
      dismiss(toast.id);
    },
    [dismiss, toast.id],
  );

  // Inline styles: drag translate (no transition while dragging so it
  // tracks the finger 1:1) and countdown animation duration.
  const style: CSSProperties = {};
  if (dragX !== 0 || dragging) {
    style.transform = `translateX(${dragX}px)`;
    style.transition = "none";
    // Fade out as the swipe approaches the dismiss threshold so the user
    // gets a clear visual confirmation that release will dismiss.
    const progress = Math.min(1, Math.abs(dragX) / SWIPE_DISMISS_DISTANCE_PX);
    style.opacity = 1 - progress * 0.5;
  }

  return (
    <div
      className={cn(
        // Elevation e5 — toast tier. Toasts are the top-most
        // ephemeral surface; pairing with `z-toast` (300) keeps them
        // above modals/sheets even when both stacks are visible.
        "text-style-label pointer-events-auto w-full pl-5 pr-4 py-3 rounded-2xl shadow-e5 relative overflow-hidden",
        "flex items-center gap-2.5 outline-none",
        "focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "touch-pan-y", // allow vertical scroll, capture horizontal swipe
        isLeaving
          ? "motion-safe:animate-toast-exit"
          : "motion-safe:animate-toast-enter",
        BASE,
        BORDER[toast.type],
      )}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      tabIndex={0}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onKeyDown={onKeyDown}
      data-toast-id={toast.id}
      data-toast-type={toast.type}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px]",
          ACCENT_STRIPE[toast.type],
        )}
      />
      <span
        className={cn(
          "shrink-0 inline-flex items-center justify-center",
          ACCENT_TEXT[toast.type],
          ICON_WRAP[toast.type],
        )}
      >
        <Icon
          name={ICON_NAME[toast.type]}
          size={16}
          strokeWidth={2.5}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1 leading-snug">{toast.msg}</span>
      {toast.action?.onClick && (
        <button
          type="button"
          onClick={() => {
            try {
              toast.action?.onClick();
            } finally {
              dismiss(toast.id);
            }
          }}
          className={cn(
            "shrink-0 px-2.5 py-1 rounded-xl bg-line/10 hover:bg-line/20 transition-colors font-semibold",
            ACCENT_TEXT[toast.type],
            "outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
          )}
        >
          {toast.action.label || "Дія"}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className={cn(
          "shrink-0 opacity-70 hover:opacity-100 transition-opacity touch-target",
          "outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent rounded-md",
        )}
        aria-label={messages.actions.close}
      >
        <Icon name="close" size={14} strokeWidth={2.5} aria-hidden />
      </button>
      {hasAction && !isLeaving && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 bottom-0 h-0.5 w-full origin-left",
            COUNTDOWN_BAR_TINT[toast.type],
            "motion-safe:animate-toast-countdown motion-reduce:scale-x-0",
            paused ? "motion-safe:[animation-play-state:paused]" : "",
          )}
          data-toast-countdown
          data-toast-paused={paused ? "true" : "false"}
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
}

/**
 * Bottom-anchored toast tray. Positioned above the bottom-nav, optional
 * `ActiveWorkoutBanner`, and iOS safe-area inset; never overlaps with
 * those layers even when several toasts stack up on a 375 px viewport.
 *
 * Per-toast politeness — error and undo-bearing toasts get
 * `role="alert" aria-live="assertive"` (the 5 s undo-window can't wait
 * for the polite queue to drain); info/success/warning stay
 * `role="status" aria-live="polite"`.
 *
 * Swipe-to-dismiss is touch-only — on desktop the close button is the
 * canonical dismiss affordance (Esc also works when the toast has
 * focus). For undo-toasts the swipe-dismiss intentionally drops the
 * snapshot (no `onUndo` call), matching the timer-expiry semantics.
 *
 * Auto-dismiss is paused while the user is hovering with the mouse,
 * keyboard-focused on the row, or actively dragging — resumes on leave.
 * Implements the WAI-ARIA Authoring Practices recommendation for
 * time-limited messages.
 */
export function ToastContainer() {
  const { toasts, dismiss, pause, resume } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      // Bottom-anchored above (in DOM-stacking sense — visually upward
      // from) the bottom-nav (`--bottom-nav-height`, 60 px when present),
      // the optional `ActiveWorkoutBanner` (~84 px above the bottom-nav),
      // and the iOS home-indicator safe-area. `z-9999` keeps the tray
      // over the FAB and module shells but still below modal portals
      // when they are explicitly placed at `z-[10000]`.
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-9999",
        "flex flex-col items-center gap-2 pointer-events-none",
        "w-[min(92vw,24rem)]",
      )}
      style={{
        bottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-height, 0px) + var(--active-workout-banner-offset, 0px) + 1rem)",
      }}
      data-testid="toast-tray"
    >
      {toasts.map((t) => (
        <ToastRow
          key={t.id}
          toast={t}
          dismiss={dismiss}
          pause={pause}
          resume={resume}
        />
      ))}
    </div>
  );
}
