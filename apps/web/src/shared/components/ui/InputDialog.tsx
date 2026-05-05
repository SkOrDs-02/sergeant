import {
  useRef,
  useEffect,
  useId,
  type HTMLInputTypeAttribute,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { z } from "zod";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { cn } from "@shared/lib/ui/cn";
import { useApiForm } from "@shared/forms/useApiForm";
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
  // Mutable cell so we can merge our local ref with RHF's `register().ref`
  // callback ref (which writes into our ref via the callback below). React's
  // overload for `useRef<T>(null)` returns the read-only `RefObject<T>`,
  // hence the `| null` to opt into the mutable variant.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

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

  useDialogFocusTrap(open, ref, { onEscape: onCancel });

  useEffect(() => {
    if (open) {
      reset({ value: defaultValue });
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValue]);

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

  const valueRegister = register("value");

  return (
    <div
      className="fixed inset-0 z-200 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        onKeyDown={handleScrimKey}
        className="absolute inset-0 bg-text/40 backdrop-blur-sm"
      />

      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onPointerDown={(e) => e.stopPropagation()}
        noValidate
        className={cn(
          "relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 overscroll-contain",
          "bg-panel rounded-3xl shadow-float border border-line p-6",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200",
        )}
      >
        <h2
          id={titleId}
          className="text-style-title text-text mb-1 leading-snug"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted leading-relaxed mb-4">
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
            "w-full h-12 rounded-xl bg-bg border border-line px-4 text-sm text-text placeholder:text-subtle mb-4",
            "transition-colors",
            "focus:outline-none",
            "focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30",
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
    </div>
  );
}
