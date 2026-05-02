import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { useAnnounce } from "./ScreenReaderAnnouncer";

/**
 * Sergeant Design System — Sheet (bottom sheet / modal)
 *
 * Canonical bottom-sheet shell used across Фінік / Фізрук / Рутина /
 * Харчування. Replaces ≥ 6 hand-rolled sheet shells that drifted on:
 *   - overlay opacity/blur
 *   - close button size (32×32 in Finyk vs 44×44 in Fizruk — a11y bug)
 *   - focus-trap wiring
 *   - keyboard inset handling
 *   - header markup & labelling
 *
 * What this enforces for every caller:
 *   - role="dialog" + aria-modal + aria-labelledby auto-wired
 *   - 44×44 close button (WCAG tap target) with <Button variant="ghost" iconOnly>
 *   - focus trap + Escape via useDialogFocusTrap
 *   - overlay-click dismiss
 *   - animated slide-up with safe-area + bottom-nav margin so the
 *     panel always clears the module bottom tab bar (see ModuleShell's
 *     `--bottom-nav-height` CSS variable) and the iOS home indicator
 *   - keyboard-inset-aware margin if kbInsetPx is supplied
 *
 * Callers are still responsible for their own form state, validation,
 * and action footer — Sheet only owns the shell.
 */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title — rendered in the header and used for aria-labelledby. */
  title: ReactNode;
  /** Optional subtitle rendered under the title. */
  description?: ReactNode;
  /** Main sheet body. */
  children?: ReactNode;
  /** Sticky footer (e.g. action buttons). Rendered inside the panel, outside the scroll area. */
  footer?: ReactNode;
  /** Slot rendered in the header row to the left of the close button (e.g. extra action). */
  headerRight?: ReactNode;
  /** Hide the drag-handle pill. */
  hideHandle?: boolean;
  /** Keyboard (visual viewport) inset in px — shifts panel up when an on-screen keyboard is visible. */
  kbInsetPx?: number;
  /** Sheet z-index. Defaults to 50 — raise for nested sheets. */
  zIndex?: number;
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Optional className on the panel (for per-module accents). */
  panelClassName?: string;
  /** Optional className on the scroll region. */
  bodyClassName?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerRight,
  hideHandle = false,
  kbInsetPx,
  zIndex = 50,
  closeLabel = "Закрити",
  panelClassName,
  bodyClassName,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(open, panelRef, { onEscape: onClose });

  // Swipe-to-dismiss — drag the panel down ≥ 80 px to close. Mirrors
  // the iOS Maps / Apple Pay sheet feel; the drag handle pill at the
  // top now actually does something. We disable the gesture once the
  // sheet starts closing so the panel doesn't snap back mid-exit.
  const swipe = useSwipeToDismiss({
    enabled: open,
    onDismiss: onClose,
  });

  // Lock body scroll while sheet is open. Matches the ad-hoc patterns
  // several existing sheets already implemented inconsistently.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Announce the sheet title to assistive tech when it opens. The
  // `aria-labelledby` wiring already exposes the title to screen
  // readers, but only if the AT user pulls focus into the dialog —
  // many SR users on iOS / Android receive a polite live-region
  // announcement faster.
  const { announce } = useAnnounce();
  useEffect(() => {
    if (!open) return;
    if (typeof title !== "string") return;
    if (!title.trim()) return;
    announce(title);
  }, [open, title, announce]);

  if (!open) return null;

  // Lift the panel above the module bottom nav (set via the
  // `--bottom-nav-height` CSS variable on ModuleShell) plus the iOS
  // home-indicator inset. `kbInsetPx` overrides the offset entirely
  // when the soft keyboard is visible — we want the sheet to hug the
  // keyboard, not float above where the nav would be.
  const baseStyle: CSSProperties =
    kbInsetPx && kbInsetPx > 0
      ? { marginBottom: kbInsetPx }
      : {
          marginBottom:
            "calc(var(--bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px))",
        };
  const panelStyle: CSSProperties = swipe.dragging
    ? {
        ...baseStyle,
        transform: `translate3d(0, ${swipe.dragOffset}px, 0)`,
        transition: "none",
        touchAction: "none",
      }
    : {
        ...baseStyle,
        transform: "translate3d(0, 0, 0)",
        transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
      };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center motion-safe:animate-fade-in"
      style={{ zIndex }}
    >
      {/* Scrim. A real <button> makes the dismiss discoverable to AT. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={panelStyle}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-lg bg-panel border-t border-line rounded-t-3xl shadow-soft",
          "flex flex-col max-h-[90vh]",
          "motion-safe:animate-slide-up",
          panelClassName,
        )}
      >
        {/*
          Swipe-to-dismiss handle. We bind the gesture to the handle
          row + header (not the full panel) so vertical scrolling
          inside the body and text input drags don't get hijacked. The
          handle is the iOS-conventional grab target and now actually
          functional.
        */}
        {!hideHandle && (
          <div
            className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
            {...swipe.bind}
            role="presentation"
          >
            <div className="w-12 h-[5px] bg-line/70 rounded-full" aria-hidden />
          </div>
        )}
        <div
          className="flex items-start justify-between gap-3 px-5 pt-1 pb-3 shrink-0 touch-pan-y"
          {...swipe.bind}
        >
          <div className="min-w-0 flex-1">
            <div
              id={titleId}
              className="text-lg font-extrabold text-text leading-tight"
            >
              {title}
            </div>
            {description && (
              <div className="text-xs text-subtle mt-1">{description}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className={cn(
                "flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-full",
                "bg-panelHi text-muted hover:text-text transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div
          className={cn(
            // `overscroll-contain` prevents rubber-band scroll from
            // leaking out to the page under the sheet — on iOS this
            // would otherwise scroll the body behind the modal while
            // the sheet is open, which is disorienting.
            "flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-5 pt-3 pb-4 border-t border-line bg-panel">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
