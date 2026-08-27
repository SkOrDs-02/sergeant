import {
  useRef,
  useEffect,
  useId,
  type HTMLInputTypeAttribute,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { useBodyScrollLock } from "@shared/hooks/useBodyScrollLock";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useKeyboardAwareOverlay } from "@shared/hooks/useKeyboardAwareOverlay";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { keyboardOverlayStyles } from "@shared/lib/ui/keyboardOverlay";
import { useApiForm } from "@shared/forms";
import { Button } from "./Button";

export interface InputDialogProps {
  open: boolean;
  title?: string;
  description?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  type?: HTMLInputTypeAttribute;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

// Item #8 round-13: form-engine — навіть утилітарний `InputDialog` тепер
// проганяється через `useApiForm`. Схема — мінімальна (вільний string), бо
// callers самі вирішують, що з value робити (для паролю, наприклад,
// довжина не валідується тут — це на боці виклику). isSubmitting
// допомагає блокувати повторний submit, якщо `onConfirm` async.
const inputDialogSchema = z.object({
  value: z.string(),
});

type InputDialogValues = z.infer<typeof inputDialogSchema>;

/**
 * Prompt-style dialog with a single text field.
 *
 * Shell aligned with Sheet / Modal (P4 Phase 2):
 * - portaled to `document.body` (escapes `.page-enter` transform traps)
 * - `bg-black/40` scrim
 * - `useBodyScrollLock` (iOS-safe)
 *
 * Keeps `role="dialog"` + form/`useApiForm` semantics — this is a
 * value prompt, not an interrupting alertdialog.
 */
export function InputDialog({
  open,
  title = "Введи значення",
  description,
  placeholder = "",
  defaultValue = "",
  type = "text",
  confirmLabel = "ОК",
  cancelLabel = "Скасувати",
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const ref = useRef<HTMLFormElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Mutable cell so we can merge our local ref with RHF's `register().ref`
  // callback ref (which writes into our ref via the callback below). React's
  // overload for `useRef<T>(null)` returns the read-only `RefObject<T>`,
  // hence the `| null` to opt into the mutable variant.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const { register, submit, reset, isSubmitting } = useApiForm<
    InputDialogValues,
    void
  >({
    schema: inputDialogSchema,
    defaultValues: { value: defaultValue },
    onSubmit: async (values) => {
      onConfirm?.(values.value);
    },
  });

  useDialogFocusTrap(open, ref, { onEscape: onCancel, inertBackground: true });
  useBodyScrollLock(open);

  // Діалог із єдиним полем вводу — клавіатура тут відкривається завжди
  // (див. автофокус нижче), тож обидві половини keyboard-геометрії
  // обовʼязкові. `kbInset` звужує бокс до видимої смуги, а хук гасить
  // пан visual viewport, яким iOS інакше зсуває весь `fixed` оверлей
  // угору — деталі у шапці `keyboardOverlay.ts`.
  const kbInsetPx = useVisualKeyboardInset(open);
  const kbStyles = keyboardOverlayStyles(kbInsetPx);
  useKeyboardAwareOverlay(open, overlayRef);

  useEffect(() => {
    if (!open) return;
    reset({ value: defaultValue });
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, defaultValue, reset]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const handleScrimKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCancel?.();
    }
  };

  const valueRegister = register("value");

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-200 flex items-end justify-center sm:items-center motion-safe:animate-fade-in"
      style={kbStyles.container}
      role="presentation"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        onKeyDown={handleScrimKey}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onSubmit={submit}
        onPointerDown={(e) => e.stopPropagation()}
        noValidate
        style={kbStyles.panel}
        className={cn(
          // `overflow-y-auto` — пара до `kbStyles.panel`: під клавіатурою
          // висота обрізається, і без власного скролу низ форми (кнопки)
          // став би недосяжним на низьких екранах.
          "relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 overscroll-contain overflow-y-auto",
          "bg-panel rounded-3xl shadow-float border border-line p-6",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-base",
        )}
      >
        <h2
          id={titleId}
          className="text-style-title text-text mb-1 leading-snug"
        >
          {title}
        </h2>
        {description && (
          <p
            id={descId}
            className="text-style-body text-muted leading-relaxed mb-4"
          >
            {description}
          </p>
        )}
        <input
          {...valueRegister}
          ref={(el) => {
            valueRegister.ref(el);
            inputRef.current = el;
          }}
          type={type}
          placeholder={placeholder}
          disabled={isSubmitting}
          className={cn(
            "w-full h-12 rounded-xl bg-bg border border-line px-4 text-style-body text-text placeholder:text-subtle mb-4",
            "transition-colors",
            "focus:outline-none",
            "focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-focus/30",
          )}
          autoComplete="off"
        />
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="w-full h-12 bg-primary! text-bg! border-0"
            disabled={isSubmitting}
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full h-12"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
