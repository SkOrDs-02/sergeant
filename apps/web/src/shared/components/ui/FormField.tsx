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
  /** Disable the uppercase eyebrow look. */
  normalCase?: boolean;
  /** Show a `· необов'язково` suffix for optional fields. */
  optional?: boolean;
}

export function Label({
  className,
  normalCase = false,
  optional = false,
  children,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn(
        normalCase
          ? "text-style-label block text-text mb-1"
          : "block text-xs text-muted uppercase tracking-wide font-semibold mb-1",
        className,
      )}
      {...props}
    >
      {children}
      {optional && (
        <span className="text-subtle normal-case font-normal">
          {" "}
          · необов&apos;язково
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
  /** Use `normal-case` label styling instead of the uppercase eyebrow. */
  normalCaseLabel?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  helperText,
  error,
  optional = false,
  normalCaseLabel = false,
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
      id: (existing.id as string | undefined) ?? controlId,
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
          normalCase={normalCaseLabel}
          className="mb-0"
        >
          {label}
        </Label>
      )}
      {enriched}
      {hasError ? (
        <p
          id={`${controlId}-error`}
          className="text-xs text-danger-strong mt-1"
          role="alert"
        >
          {error}
        </p>
      ) : helperText ? (
        <p id={`${controlId}-hint`} className="text-xs text-subtle mt-1">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
