/**
 * Last validated: 2026-08-16
 * Status: Active
 */
import { forwardRef, useId } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Input, type InputProps } from "./Input";

export interface TimeFieldProps extends Omit<
  InputProps,
  "type" | "label" | "helperText"
> {
  label?: string | undefined;
  helperText?: string | undefined;
}

/**
 * iOS-safe time input — the `type="time"` twin of `DateField`.
 *
 * **Навіщо окремий примітив.** Мобільний Safari дає `input[type=time]`, як і
 * `type=date`, ВЛАСНИЙ intrinsic inline-size: контрол малюється під формат
 * локалі й ігнорує `w-full`, якщо контейнер дозволяє йому розтягтись. У
 * grid- чи flex-комірці (де `min-width` за замовчуванням `auto`) цей intrinsic
 * розмір розсуває саму комірку — картка стає ширшою за екран, і форму
 * доводиться скролити вбік. Скарга тестера 2026-08-16 на «Записати тренування
 * заднім числом» — рівно цей випадок.
 *
 * Контракт той самий, що й у `DateField`: `min-w-0` + явні
 * `min-inline-size: 0` / `inline-size: 100%` на нативному контролі, і
 * `overflow-hidden` на рамці, щоб нативний індикатор не вилазив за радіус.
 * Тримати це в одному місці дешевше, ніж повторювати магічні класи по формах.
 */
export const TimeField = forwardRef<HTMLInputElement, TimeFieldProps>(
  function TimeField(
    {
      id: idProp,
      label,
      helperText,
      className,
      error,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const helperId = helperText ? `${id}-helper` : undefined;

    return (
      <div className="flex w-full min-w-0 max-w-full flex-col gap-1">
        {label ? (
          <label
            htmlFor={id}
            className="text-style-label text-text leading-snug"
          >
            {label}
          </label>
        ) : null}
        <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-panelHi focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-focus/30">
          <Input
            {...props}
            ref={ref}
            id={id}
            type="time"
            error={error}
            aria-label={ariaLabel ?? label}
            aria-describedby={helperId}
            className={cn(
              "min-w-0 max-w-full border-0 rounded-[calc(1rem-1px)] focus-visible:border-transparent focus-visible:ring-0 [min-inline-size:0] [inline-size:100%]",
              className,
            )}
          />
        </div>
        {helperText ? (
          <p
            id={helperId}
            role={error ? "alert" : "status"}
            className={cn(
              "text-style-caption leading-snug",
              error ? "text-danger-strong dark:text-danger" : "text-subtle",
            )}
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);
