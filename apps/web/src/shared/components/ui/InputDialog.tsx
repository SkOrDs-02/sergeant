import {
  useRef,
  useState,
  useEffect,
  useId,
  type FormEvent,
  type HTMLInputTypeAttribute,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { cn } from "@shared/lib/ui/cn";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const titleId = useId();

  useDialogFocusTrap(open, ref, { onEscape: onCancel });

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onConfirm?.(value);
  };

  const handleScrimKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCancel?.();
    }
  };

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
        onSubmit={handleSubmit}
        onPointerDown={(e) => e.stopPropagation()}
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
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
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
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full h-12"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
