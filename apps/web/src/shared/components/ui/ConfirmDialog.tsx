import {
  memo,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@shared/hooks/useBodyScrollLock";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useSwipeToDismiss } from "@shared/hooks/useSwipeToDismiss";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
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
 *
 * Shell aligned with Sheet / Modal (P4 Phase 2):
 * - `bg-black/40` scrim (not `bg-text/40` — that *lightens* in dark mode)
 * - `useBodyScrollLock` (iOS-safe; not bare `overflow: hidden`)
 * - portaled to `document.body`
 *
 * Keeps `role="alertdialog"` — confirmations interrupt the flow and
 * must announce the warning before the action buttons.
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
  const titleId = useId();
  const descId = useId();
  useDialogFocusTrap(open, ref, { onEscape: onCancel, inertBackground: true });

  // Pulling the sheet down to dismiss is the same gesture users already
  // know from <Sheet>. We treat dismiss as "cancel" — destructive
  // confirms still require an explicit tap on the danger button.
  const swipe = useSwipeToDismiss({
    enabled: open,
    onDismiss: () => onCancel?.(),
  });

  useBodyScrollLock(open);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const handleScrimKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCancel?.();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-end justify-center sm:items-center motion-safe:animate-fade-in"
      role="presentation"
    >
      {/* Scrim — real <button> keeps dismiss reachable by keyboard & AT.

          Імʼя скрима НЕ дорівнює `cancelLabel` (V-8, аудит Профілю/
          Налаштувань 2026-08-08). Доти обидва звалися «Скасувати», і в
          дереві доступності виходили дві кнопки з однаковим іменем —
          скрінрідер не міг їх розрізнити, а role-запит у тестах ламався на
          «Found multiple elements». Той самий дефект уже ловили в цьому ж
          аудиті на парі «хрестик пошуку» ↔ «Очистити пошук». Скрим —
          не дублікат кнопки скасування, а окремий засіб «закрити діалог
          тапом повз нього», і зватись має саме так. */}
      <button
        type="button"
        aria-label={messages.actions.close}
        onClick={onCancel}
        onKeyDown={handleScrimKey}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
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
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-base",
        )}
      >
        <h2
          id={titleId}
          className="text-style-title text-text mb-2 leading-snug"
        >
          {title}
        </h2>
        {description && (
          // Дефект #2 (CodeRabbit post-merge review PR #756): `<p>` — блочний
          // елемент, але його content model за специфікацією — лише phrasing
          // content, тобто `<ul>` чи вкладений `<p>` усередині нього
          // невалідні. Реальний HTML-парсер авто-закрив
          // би `<p>` перед першим таким блоком, розірвавши
          // `aria-describedby`-звʼязок і породжуючи React DOM-nesting
          // warning. Викликачі (як `HubBackupPanel`) передають описи зі
          // списками — `<div>` з тим самим класом дає той самий вигляд без
          // невалідної вкладеності.
          <div
            id={descId}
            className="text-style-body text-muted leading-relaxed mb-5"
          >
            {description}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant={danger ? "destructive" : "primary"}
            className="w-full h-12"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            className="w-full h-12"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
