import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared/lib/ui/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

/**
 * Sergeant Design System — Modal (centered dialog)
 *
 * Centered counterpart to `Sheet` (bottom-sheet). Use Modal for focused,
 * form-free messages and short confirmations that should not cover the
 * bottom of the screen (e.g. Stories viewer controls, quick prompts on
 * tablet / desktop widths).
 *
 * What this enforces for every caller:
 *   - role="dialog" + aria-modal + aria-labelledby auto-wired
 *   - 44×44 close button (WCAG tap target) via shared `Button` iconOnly
 *   - focus trap + Escape via `useDialogFocusTrap`
 *   - overlay-click dismiss (unless `dismissOnOverlayClick={false}`)
 *   - body scroll lock while open
 *
 * Callers own: header content, body, optional footer actions.
 */

export type ModalSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title — rendered in the header and used for aria-labelledby. */
  title?: ReactNode;
  /** Optional subtitle rendered under the title. */
  description?: ReactNode;
  /** Main modal body. */
  children?: ReactNode;
  /** Sticky footer (e.g. action buttons). */
  footer?: ReactNode;
  /** Width preset. Defaults to "md". */
  size?: ModalSize;
  /** Modal z-index. Defaults to 200 (matches `zIndex.modal` token). */
  zIndex?: number;
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Hide the close button (e.g. when a modal must be confirmed). */
  hideClose?: boolean;
  /** Dismiss on overlay click. Defaults to true. */
  dismissOnOverlayClick?: boolean;
  /** Optional className on the panel (per-surface accents). */
  panelClassName?: string;
  /** Optional className on the scroll region. */
  bodyClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  zIndex = 200,
  closeLabel = "Закрити",
  hideClose = false,
  dismissOnOverlayClick = true,
  panelClassName,
  bodyClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocusTrap(open, panelRef, { onEscape: onClose });

  // Adaptive layout: on coarse-pointer devices (touch screens) the
  // bottom-sheet hand-off feels more native than a centered modal.
  // We delegate to <Sheet>, which already owns drag-to-dismiss, the
  // 44×44 close button, focus trap and safe-area handling, so the
  // behaviour stays consistent with sheets that callers render
  // directly. We only swap when the modal has a title (Sheet requires
  // one for `aria-labelledby`) and the close affordance is visible —
  // titleless / unclosable modals (e.g. Stories controls) keep the
  // centered layout because the sheet's drag-handle + close button
  // would conflict with their bespoke chrome.
  const coarse = useCoarsePointer();
  const useSheet = coarse && !hideClose && Boolean(title);

  useEffect(() => {
    if (!open || useSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, useSheet]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  if (useSheet) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        footer={footer}
        zIndex={zIndex}
        closeLabel={closeLabel}
        panelClassName={panelClassName}
        bodyClassName={bodyClassName}
      >
        {children}
      </Sheet>
    );
  }

  const handleOverlayKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClose();
    }
  };

  // Portal the centered dialog to <body> so the modal escapes every
  // ancestor stacking / containing-block context. Several routes wrap
  // their root in a `.page-enter` element whose entry animation keeps
  // `transform: translateY(0)` via `animation-fill-mode: both`. Per the
  // CSS spec, any non-`none` `transform` on an ancestor establishes a
  // new containing block — which means our `position: fixed` overlay is
  // anchored to that ancestor's box (often the entire scroll height of
  // the route) instead of the viewport, and the dialog renders far
  // below the visible area. Mirrors `WeeklyDigestStories` which solves
  // the same problem for the same reason.
  const dialog = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 motion-safe:animate-fade-in"
      style={{ zIndex }}
    >
      {/* Scrim — real <button> keeps dismiss reachable by AT. */}
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={dismissOnOverlayClick ? 0 : -1}
        onClick={dismissOnOverlayClick ? onClose : undefined}
        onKeyDown={dismissOnOverlayClick ? handleOverlayKey : undefined}
        // `bg-text` resolves to a near-white in dark mode and a near-black
        // in light mode, so `bg-text/40` *lightens* the page on dark and
        // dims on light — opposite of what a modal scrim is supposed to
        // do. Switch to the same `bg-black/40 backdrop-blur-sm` Sheet has
        // used since portaling so both primitives behave consistently
        // across themes.
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          // Elevation e4 — modal/sheet tier. Pairs with the default
          // `zIndex={200}` prop (`zTier.modal`); a Modal must always
          // sit at e4+z-modal so it clears every dropdown, popover
          // and sticky header.
          "relative w-full bg-surface border border-line rounded-3xl shadow-e4",
          "flex flex-col max-h-[min(90vh,calc(100dvh-2rem))]",
          "motion-safe:animate-scale-in",
          sizes[size],
          panelClassName,
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <div
                  id={titleId}
                  className="text-lg font-extrabold text-fg leading-tight"
                >
                  {title}
                </div>
              )}
              {description && (
                <div
                  id={descriptionId}
                  className="text-sm text-fg-muted leading-relaxed mt-1"
                >
                  {description}
                </div>
              )}
            </div>
            {!hideClose && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={onClose}
                aria-label={closeLabel}
                className="shrink-0"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            )}
          </div>
        )}

        <div
          className={cn(
            "overflow-y-auto overscroll-contain px-5 pb-5",
            title || !hideClose ? "pt-0" : "pt-5",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="px-5 py-4 border-t border-line shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
