import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Label / FormField
 *
 * Consolidates the 5+ flavours of field labels drifting across modules:
 *   - `text-xs text-muted uppercase tracking-wide font-semibold mb-1 block`
 *   - `text-2xs font-bold text-subtle uppercase tracking-widest`
 *   - `text-style-label text-text`
 *
 * The canonical label is the first variant (Finyk/ManualExpenseSheet
 * pattern), which is already the most prevalent.
 *
 * <FormField> wires `id`/`htmlFor` + optional helper and error slot
 * for you — if the child is a single <Input>/<Select>/<Textarea>,
 * the matching id and aria-describedby get cloned onto it. If you
 * need full control, pass `htmlFor` explicitly.
 */

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Намалювати мітку ВЕЛИКИМИ ЛІТЕРАМИ — «бровою», як службовий напис.
   *
   * За замовчуванням вимкнено (рішення власника 2026-08-06 на
   * `mockups/product/pending-decisions.html`). Раніше було навпаки, і
   * проп звався `normalCase` — тобто дефолтом був капс, а викликач мусив
   * від нього відмовлятись.
   *
   * AI-CONTEXT: перевертання дефолту вирішило й питання, через яке ця
   * правка стояла на паузі — що взагалі означає цей проп. Поки капс був
   * дефолтом, `normalCase` був перемикачем між двома майже однаковими
   * станами й не називав жодного наміру. `caps` називає: «це не питання
   * до людини, а позначка на приладі». Такий намір рідкісний, тому й
   * опція, а не дефолт.
   *
   * Замір, що вирішив: підписів у продукті було 36, і 7 із них уже
   * примусово вимикали капс. Коли пʼята частина коду бореться з
   * налаштуванням, воно не дефолт.
   */
  caps?: boolean;
  /** Show a `· необовʼязково` suffix for optional fields. */
  optional?: boolean;
}

export function Label({
  className,
  caps = false,
  optional = false,
  children,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn(
        caps
          ? "block text-style-caption text-muted uppercase tracking-wide font-semibold mb-1"
          : // `normal-case` явно: роль `text-style-label` задає лише кегль,
            // вагу й трекінг — `text-transform` вона НЕ скидає, тож
            // успадкований `uppercase` протік би крізь новий дефолт.
            "text-style-label normal-case block text-text mb-1",
        className,
      )}
      {...props}
    >
      {children}
      {optional && (
        <span className="text-subtle normal-case font-normal">
          {" "}
          · необовʼязково
        </span>
      )}
    </label>
  );
}

export interface FormFieldProps {
  label?: ReactNode;
  /** Explicit id for the labelled control. Auto-generated if omitted. */
  htmlFor?: string;
  /** Secondary helper text rendered under the control. */
  helperText?: ReactNode;
  /** Error message. If present overrides helperText and marks the control invalid. */
  error?: ReactNode;
  /** Mark label as optional. */
  optional?: boolean;
  /** Намалювати мітку капсом-бровою. За замовчуванням — звичайний регістр. */
  capsLabel?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  helperText,
  error,
  optional = false,
  capsLabel = false,
  className,
  children,
}: FormFieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;
  const hasError = !!error;
  const describedById = hasError
    ? `${controlId}-error`
    : helperText
      ? `${controlId}-hint`
      : undefined;

  // If exactly one React-element child and it doesn't already carry an id,
  // wire the label/aria plumbing for the caller.
  const enriched = (() => {
    const arr = Children.toArray(children);
    if (arr.length !== 1 || !isValidElement(arr[0])) return children;
    const child = arr[0] as ReactElement<Record<string, unknown>>;
    const existing = child.props ?? {};
    return cloneElement(child, {
      id: (existing["id"] as string | undefined) ?? controlId,
      "aria-describedby":
        (existing["aria-describedby"] as string | undefined) ?? describedById,
      "aria-invalid":
        (existing["aria-invalid"] as boolean | undefined) ??
        (hasError ? true : undefined),
    } as Record<string, unknown>);
  })();

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <Label
          htmlFor={controlId}
          optional={optional}
          caps={capsLabel}
          className="mb-0"
        >
          {label}
        </Label>
      )}
      {enriched}
      {hasError ? (
        <p
          id={`${controlId}-error`}
          className="text-style-caption text-danger-strong mt-1"
          role="alert"
        >
          {error}
        </p>
      ) : helperText ? (
        <p
          id={`${controlId}-hint`}
          className="text-style-caption text-subtle mt-1"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
