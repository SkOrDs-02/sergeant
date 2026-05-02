import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useSwipeToDismiss } from "@shared/hooks/useSwipeToDismiss";
import { cn } from "@shared/lib/cn";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/**
 * Reusable confirmation dialog (bottom sheet style).
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  title = "Підтвердити дію",
  description,
  confirmLabel = "Видалити",
  cancelLabel = "Скасувати",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, ref, { onEscape: onCancel });

  // Pulling the sheet down to dismiss is the same gesture users already
  // know from <Sheet>. We treat dismiss as "cancel" — destructive
  // confirms still require an explicit tap on the danger button.
  const swipe = useSwipeToDismiss({
    enabled: open,
    onDismiss: () => onCancel?.(),
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleScrimKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
      role="presentation"
    >
      {/* Scrim — real <button> keeps dismiss reachable by keyboard & AT. */}
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        onKeyDown={handleScrimKey}
        className="absolute inset-0 bg-text/40 backdrop-blur-sm motion-safe:animate-fade-in"
      />

      {/* Sheet */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={
          swipe.dragging
            ? ({
                transform: `translate3d(0, ${swipe.dragOffset}px, 0)`,
                transition: "none",
              } satisfies CSSProperties)
            : ({
                transform: "translate3d(0, 0, 0)",
                transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
              } satisfies CSSProperties)
        }
        // Stop propagation so a pointerdown on the panel doesn't fall
        // through to the scrim button beneath. We forward the swipe
        // hook's handlers explicitly (rather than spreading) so we can
        // also call stopPropagation on the down event.
        onPointerDown={(e) => {
          e.stopPropagation();
          swipe.bind.onPointerDown(e);
        }}
        onPointerMove={swipe.bind.onPointerMove}
        onPointerUp={swipe.bind.onPointerUp}
        onPointerCancel={swipe.bind.onPointerCancel}
        className={cn(
          "relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 overscroll-contain touch-pan-y",
          "bg-panel rounded-3xl shadow-float border border-line p-6",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200",
        )}
      >
        <h2
          id="confirm-title"
          className="text-style-title text-text mb-2 leading-snug"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted leading-relaxed mb-5">
            {description}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant={danger ? "destructive" : "primary"}
            className="w-full h-12"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" className="w-full h-12" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
});
