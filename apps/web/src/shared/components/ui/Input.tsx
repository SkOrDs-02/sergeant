import {
  forwardRef,
  type HTMLInputTypeAttribute,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/ui/cn";
import { searchFieldAutofillGuard } from "../../lib/ui/searchFieldProps";
import type { FormVariant, SmallMediumLarge } from "./types";

/**
 * Opinionated per-`type` defaults for `spellCheck`, `inputMode`, and
 * `autoComplete`. Per the Web Interface Guidelines, non-prose inputs
 * (email / url / password / numeric / code fields) should disable
 * spellcheck so the browser does not red-underline legitimate values
 * and should hint the right software keyboard / autofill category on
 * mobile. Consumers can always override by passing the prop explicitly
 * — the Input only fills in a default when the caller did not.
 */
const NON_PROSE_TYPES = new Set<HTMLInputTypeAttribute>([
  "email",
  "password",
  "url",
  "tel",
  "number",
  "search",
]);

const DEFAULT_INPUT_MODE: Partial<
  Record<
    HTMLInputTypeAttribute,
    InputHTMLAttributes<HTMLInputElement>["inputMode"]
  >
> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "decimal",
  search: "search",
};

/**
 * Sergeant Design System — Input Component
 *
 * Sizes: sm, md, lg
 * Variants: default, filled, ghost
 * States: error, success
 */

export type InputSize = SmallMediumLarge;
export type InputVariant = FormVariant;

/**
 * AI-DANGER: `pointer-coarse:min-h-[44px]` — у ПІКСЕЛЯХ, не в rem, і це не
 * дублювання `h-11`. На вузьких мобільних вьюпортах корінний шрифт падає до
 * 15px (перевірено: 320px → 15px, 390px → 16px), тож `h-11` = 2.75rem дає
 * 41.25px і тихо провалює 44px-флор WCAG 2.5.5 саме там, де палець
 * найтовщий. `Button` цю ж пастку обходить тим самим px-флором
 * (`Button.tsx`); `Input` його не мав — браузерний аудит 2026-08-26.
 */
const COARSE_TOUCH_FLOOR = "pointer-coarse:min-h-[44px]";

// Мова H (v3.1): поле 48 px, радіус 8. `sm` лишається для щільних рядків.
const sizes: Record<InputSize, string> = {
  sm: `h-9 px-3 text-style-body rounded-lg ${COARSE_TOUCH_FLOOR}`,
  md: `h-12 px-4 text-style-body rounded-lg ${COARSE_TOUCH_FLOOR}`,
  lg: `h-12 px-5 text-style-body rounded-lg ${COARSE_TOUCH_FLOOR}`,
};

/**
 * Фокус мовою H (v3.1): обвід 2 px чорнилом без зовнішнього кільця. Межа
 * 1 px стає чорнилом, а `inset-ring` домальовує другий піксель усередину,
 * тож поле не стрибає на піксель. Саме `inset-ring`, а не `ring`: глобальне
 * правило `theme.css` перефарбовує `--tw-ring-color` на `:focus-visible` у
 * колір фокусу, а `--tw-inset-ring-color` не чіпає.
 *
 * AI-DANGER: межа лишається `border-control`, а не `border-strong` зі спеки
 * v3.1: `border-strong` дає 1.6:1 проти панелі, а межа поля за WCAG 1.4.11
 * мусить мати 3:1 (аудит контрасту 2026-10-01, A8, гейт
 * `theme.controlFocus.test.ts`). Розбіжність записано в журналі PR2.
 */
export const FIELD_INK_FOCUS =
  "focus-visible:border-text focus-visible:inset-ring focus-visible:inset-ring-text";

const variants: Record<InputVariant, string> = {
  default: `bg-panelHi border border-control caret-brand ${FIELD_INK_FOCUS}`,
  filled: `bg-panelHi border border-transparent caret-brand focus-visible:bg-panel ${FIELD_INK_FOCUS}`,
  ghost: `bg-transparent border border-transparent caret-brand hover:bg-panelHi focus-visible:bg-panelHi ${FIELD_INK_FOCUS}`,
};

export const FIELD_ERROR =
  "border-danger/70 focus-visible:border-danger focus-visible:inset-ring-danger";

/** Помилка під полем: текст небезпеки 13 px (v3.1, І А6). */
export const FIELD_ERROR_TEXT =
  "text-style-label text-danger-strong dark:text-danger";

/** Підпис поля: 14 / 500 другим сірим, звичайний регістр (v3.1, І А4). */
export const FIELD_LABEL =
  "text-style-label normal-case text-muted leading-snug";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  size?: InputSize | undefined;
  variant?: InputVariant | undefined;
  error?: boolean | undefined;
  success?: boolean | undefined;
  icon?: ReactNode | undefined;
  suffix?: ReactNode | undefined;
  /** Helper text shown below the input — turns red on error. */
  helperText?: string | undefined;
  /** Input label — rendered above the field with correct `htmlFor`. */
  label?: string | undefined;
  /**
   * When `true` (or when `maxLength` is set and a `value` prop is present),
   * renders a live "12/50" counter in the helper row. Color shifts to
   * warning at ≥80 % and danger at 100 %.
   */
  showCharCount?: boolean | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    size = "md",
    variant = "default",
    error,
    success,
    icon,
    suffix,
    helperText,
    label,
    id,
    type,
    spellCheck,
    inputMode,
    showCharCount,
    ...props
  },
  ref,
) {
  const stateClass = error ? FIELD_ERROR : success ? "border-brand-400" : "";

  const maxLen = props.maxLength;
  const currentLen =
    maxLen !== undefined ? String(props.value ?? "").length : 0;
  // Explicit `showCharCount={false}` wins over the maxLength auto-opt-in.
  // Without this escape hatch, adding `maxLength` purely as a storage guard
  // (see the beta-input-boundaries spec, which rejected counters as UI noise)
  // silently ships a counter — and on an uncontrolled RHF field, where
  // `props.value` is undefined, it is stuck reading "0/200".
  const renderCounter =
    showCharCount !== false &&
    (showCharCount || maxLen !== undefined) &&
    maxLen !== undefined;
  const maxLenSafe = maxLen ?? 0;
  const counterColor =
    currentLen >= maxLenSafe
      ? "text-danger-strong dark:text-danger"
      : maxLenSafe > 0 && currentLen / maxLenSafe >= 0.8
        ? "text-warning-strong dark:text-warning"
        : "text-subtle";

  // Type-aware defaults. The caller's explicit prop always wins — these
  // only fill in when `undefined` so existing call sites don't change.
  const resolvedSpellCheck =
    spellCheck ?? (type && NON_PROSE_TYPES.has(type) ? false : undefined);
  const resolvedInputMode =
    inputMode ?? (type ? DEFAULT_INPUT_MODE[type] : undefined);
  // Password-manager guard for search fields (tester report 2026-08-10:
  // Chrome offered saved credentials in the settings-search box and refilled
  // the e-mail after every clear). Spread BEFORE `...props` below so an
  // explicit `autoComplete` / `name` from the caller still wins — see
  // `searchFieldProps.ts` for why `autocomplete="off"` alone is not enough.
  const searchGuard = type === "search" ? searchFieldAutofillGuard : undefined;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-1">
      {label && (
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
      )}
      <div className="relative w-full min-w-0 max-w-full">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          {...searchGuard}
          spellCheck={resolvedSpellCheck}
          inputMode={resolvedInputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={helperText && id ? `${id}-helper` : undefined}
          className={cn(
            "box-border w-full text-text placeholder:text-subtle",
            "outline-none transition-colors duration-base",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            sizes[size],
            variants[variant],
            stateClass,
            icon && "pl-10",
            suffix && "pr-10",
            className,
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {suffix}
          </div>
        )}
      </div>
      {(helperText || renderCounter) && (
        <div className="flex items-center justify-between gap-2">
          {helperText ? (
            <p
              id={id ? `${id}-helper` : undefined}
              role={error ? "alert" : "status"}
              className={cn(
                "leading-snug",
                error ? FIELD_ERROR_TEXT : "text-style-caption text-subtle",
              )}
            >
              {helperText}
            </p>
          ) : (
            <span />
          )}
          {renderCounter && (
            <span
              className={cn(
                "text-style-caption tabular-nums shrink-0 transition-colors",
                counterColor,
              )}
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${currentLen} з ${maxLen} символів`}
            >
              {currentLen}/{maxLen}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: InputVariant;
  error?: boolean;
  /** Helper text shown below the textarea — turns red on error. */
  helperText?: string;
  /** Label rendered above the textarea. */
  label?: string;
}

/**
 * Textarea — Multi-line text input
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      className,
      variant = "default",
      error,
      rows = 3,
      helperText,
      label,
      id,
      ...props
    },
    ref,
  ) {
    const stateClass = error ? FIELD_ERROR : "";

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className={FIELD_LABEL}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={helperText && id ? `${id}-helper` : undefined}
          className={cn(
            "w-full px-4 py-3 text-style-body text-text placeholder:text-subtle rounded-lg",
            "outline-none transition-colors duration-base resize-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            variants[variant],
            stateClass,
            className,
          )}
          {...props}
        />
        {helperText && (
          <p
            id={id ? `${id}-helper` : undefined}
            role={error ? "alert" : "status"}
            className={cn(
              "leading-snug",
              error ? FIELD_ERROR_TEXT : "text-style-caption text-subtle",
            )}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
