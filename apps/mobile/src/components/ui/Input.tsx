/**
 * Sergeant Design System — Input (React Native)
 *
 * Mobile port of the web `Input` + `Textarea` primitives. The public API
 * stays close to web so screens can share prop shapes across platforms
 * — `size`, `variant`, `error`, `success`, `icon`, `suffix`, `type`,
 * and an optional `multiline` escape hatch for the textarea use case.
 *
 * @see apps/web/src/shared/components/ui/Input.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same `InputSize` (`sm` / `md` / `lg`) and `InputVariant`
 *   (`default` / `filled` / `ghost`) enums.
 * - Same `error` / `success` state styling contract: the border picks
 *   up a `danger` / `brand` accent and (on web) `aria-invalid` flips
 *   when `error` is set — the RN analogue is `accessibilityState.invalid`.
 * - Same "type-aware defaults" trick: an explicit `keyboardType` /
 *   `autoComplete` / `autoCapitalize` / `secureTextEntry` / `spellCheck`
 *   always wins, but `type` fills in sensible defaults for non-prose
 *   inputs (email / url / tel / number / password / search) to match
 *   the web component's UX.
 * - `Textarea` is exported alongside `Input` as on web; it's a thin
 *   wrapper that flips `multiline` + `numberOfLines`.
 *
 * Differences from web (intentional — see PR body):
 * - No `focus-visible` pseudo-class in RN. We drive a focused state via
 *   `onFocus` / `onBlur` and toggle a NativeWind class to emulate the
 *   focus ring. Keyboard-vs-pointer distinction isn't meaningful on
 *   touch devices.
 * - Icon / suffix slots don't use absolute positioning. RN's text
 *   input won't measure the content inside a parent reliably, so the
 *   slot is laid out with `flex-row` and the text input `flex-1`s into
 *   the remaining space. Visual result is the same.
 * - Semantic colour tokens (`bg-panelHi`, `border-line`, `text-text`,
 *   `text-subtle`, `bg-danger`, …) now resolve through CSS variables
 *   in `global.css`.
 */

import { forwardRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react-native";

import { colors } from "@/theme";

export type InputSize = "sm" | "md" | "lg";
export type InputVariant = "default" | "filled" | "ghost";

/**
 * Mirrors the subset of web `<input type>` we actually use on Sergeant
 * screens. Anything not in this union falls through to plain text input
 * with no type-aware defaults.
 */
export type InputType =
  | "text"
  | "email"
  | "password"
  | "url"
  | "tel"
  | "number"
  | "search";

const NON_PROSE_TYPES: ReadonlySet<InputType> = new Set<InputType>([
  "email",
  "password",
  "url",
  "tel",
  "number",
  "search",
]);

const DEFAULT_KEYBOARD: Partial<
  Record<InputType, TextInputProps["keyboardType"]>
> = {
  email: "email-address",
  tel: "phone-pad",
  url: "url",
  number: "decimal-pad",
};

const DEFAULT_AUTOCOMPLETE: Partial<
  Record<InputType, TextInputProps["autoComplete"]>
> = {
  email: "email",
  password: "password",
  tel: "tel",
  url: "url",
};

const DEFAULT_AUTOCAPITALIZE: Partial<
  Record<InputType, TextInputProps["autoCapitalize"]>
> = {
  email: "none",
  password: "none",
  url: "none",
  tel: "none",
  search: "none",
};

// Size presets — mirror web height / padding / radius map 1:1.
const sizes: Record<InputSize, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-4 text-base rounded-2xl",
  lg: "h-12 px-5 text-base rounded-2xl",
};

const variantBase: Record<InputVariant, string> = {
  default: "bg-panelHi border border-line",
  filled: "bg-panelHi border border-transparent",
  ghost: "bg-transparent border border-transparent",
};

const variantFocused: Record<InputVariant, string> = {
  default: "border-brand-400",
  filled: "bg-cream-50 border-brand-400",
  ghost: "bg-cream-100",
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface InputProps extends Omit<
  TextInputProps,
  "style" | "secureTextEntry" | "keyboardType" | "autoCapitalize"
> {
  /** Size preset. Mirrors web. Defaults to `md`. */
  size?: InputSize;
  /** Visual variant. Mirrors web. Defaults to `default`. */
  variant?: InputVariant;
  /** Error state — flips the border to danger and sets `aria-invalid`. */
  error?: boolean;
  /** Success state — flips the border to the brand accent. */
  success?: boolean;
  /**
   * Web `type`. On RN we use it to pick sensible keyboard / autocomplete /
   * capitalisation / secure-entry defaults. Pass an explicit prop to
   * override any of them.
   */
  type?: InputType;
  /** Leading icon / adornment. Laid out before the input with `flex-row`. */
  icon?: ReactNode;
  /** Trailing adornment. Laid out after the input with `flex-row`. */
  suffix?: ReactNode;
  /** Extra classes applied to the `TextInput` element. */
  className?: string;
  /** Extra classes applied to the wrapper `View` (slot container). */
  containerClassName?: string;
  /** Helper text shown below the input. Turns red on `error`. */
  helperText?: string;
  /** Label rendered above the input field. */
  label?: string;
  /** Show icon in helper text for error/success states. Defaults to false. */
  showHelperIcon?: boolean;
  /** Show character count when maxLength is set. Defaults to true when maxLength is provided. */
  showCharacterCount?: boolean;
  /** Show password visibility toggle for password fields. Defaults to true for type="password". */
  showPasswordToggle?: boolean;
  /**
   * Explicit RN overrides — the caller's value always wins over the
   * `type`-derived defaults.
   */
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  secureTextEntry?: TextInputProps["secureTextEntry"];
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    size = "md",
    variant = "default",
    error,
    success,
    type,
    icon,
    suffix,
    className,
    containerClassName,
    helperText,
    label,
    showHelperIcon = false,
    showCharacterCount,
    showPasswordToggle,
    keyboardType,
    autoCapitalize,
    autoComplete,
    secureTextEntry,
    spellCheck,
    onFocus,
    onBlur,
    onChangeText,
    editable = true,
    maxLength,
    value,
    defaultValue,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [charCount, setCharCount] = useState(
    () => (value ?? defaultValue ?? "").length,
  );
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Show character count when maxLength is set, unless explicitly disabled
  const shouldShowCharCount = showCharacterCount ?? maxLength !== undefined;
  // Show password toggle for password type unless explicitly disabled
  const shouldShowPasswordToggle = showPasswordToggle ?? type === "password";
  const isNearLimit = maxLength !== undefined && charCount >= maxLength * 0.9;
  const isAtLimit = maxLength !== undefined && charCount >= maxLength;

  // Type-aware defaults — explicit caller props always win.
  const resolvedKeyboard =
    keyboardType ?? (type ? DEFAULT_KEYBOARD[type] : undefined);
  const resolvedAutoComplete =
    autoComplete ?? (type ? DEFAULT_AUTOCOMPLETE[type] : undefined);
  const resolvedAutoCapitalize =
    autoCapitalize ?? (type ? DEFAULT_AUTOCAPITALIZE[type] : undefined);
  // For password fields with toggle, use internal visibility state
  const resolvedSecure =
    secureTextEntry ?? (type === "password" ? !passwordVisible : undefined);
  const resolvedSpellCheck =
    spellCheck ?? (type && NON_PROSE_TYPES.has(type) ? false : undefined);

  const stateClass = error
    ? "border-danger"
    : success
      ? "border-brand-400"
      : focused
        ? variantFocused[variant]
        : "";

  return (
    <View className="gap-1">
      {label ? (
        <Text className="text-sm font-medium text-fg leading-snug">
          {label}
        </Text>
      ) : null}
      <View
        className={cx(
          "flex-row items-center",
          sizes[size],
          variantBase[variant],
          stateClass,
          "border",
          focused && !error && !success ? "ring-2 ring-brand-400/40" : "",
          !editable && "opacity-50",
          containerClassName,
        )}
      >
        {icon ? <View className="mr-2">{icon}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          keyboardType={resolvedKeyboard}
          autoComplete={resolvedAutoComplete}
          autoCapitalize={resolvedAutoCapitalize}
          secureTextEntry={resolvedSecure}
          spellCheck={resolvedSpellCheck}
          placeholderTextColor="#a8a29e"
          accessibilityState={{
            disabled: !editable,
          }}
          aria-invalid={error ? true : undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChangeText={(text) => {
            setCharCount(text.length);
            onChangeText?.(text);
          }}
          value={value}
          maxLength={maxLength}
          className={cx("flex-1 text-base text-fg", className)}
          {...props}
        />
        {shouldShowPasswordToggle && type === "password" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Приховати пароль" : "Показати пароль"
            }
            onPress={() => setPasswordVisible((v) => !v)}
            className="ml-2 w-8 h-8 items-center justify-center rounded-lg active:bg-cream-200/50"
          >
            {passwordVisible ? (
              <EyeOff size={18} color={colors.textMuted} strokeWidth={2} />
            ) : (
              <Eye size={18} color={colors.textMuted} strokeWidth={2} />
            )}
          </Pressable>
        ) : suffix ? (
          <View className="ml-2">{suffix}</View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-1.5 mt-0.5">
        {helperText ? (
          <>
            {showHelperIcon && error && (
              <AlertCircle size={14} color={colors.danger} strokeWidth={2} />
            )}
            {showHelperIcon && success && !error && (
              <CheckCircle size={14} color={colors.success} strokeWidth={2} />
            )}
            <Text
              className={cx(
                "text-xs leading-snug flex-1",
                error
                  ? "text-danger"
                  : success
                    ? "text-success"
                    : "text-fg-muted",
              )}
            >
              {helperText}
            </Text>
          </>
        ) : (
          <View className="flex-1" />
        )}
        {shouldShowCharCount && maxLength !== undefined ? (
          <Text
            className={cx(
              "text-xs tabular-nums",
              isAtLimit
                ? "text-danger"
                : isNearLimit
                  ? "text-warning"
                  : "text-fg-subtle",
            )}
            accessibilityLabel={`${charCount} з ${maxLength} символів`}
          >
            {charCount}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export interface TextareaProps extends Omit<
  TextInputProps,
  "style" | "multiline" | "numberOfLines"
> {
  variant?: InputVariant;
  error?: boolean;
  /** Visible row height (maps to RN's `numberOfLines`). Defaults to 3. */
  rows?: number;
  className?: string;
  containerClassName?: string;
  /** Helper text shown below the textarea. Turns red on `error`. */
  helperText?: string;
  /** Label rendered above the textarea. */
  label?: string;
}

/**
 * Textarea — Multi-line text input. Matches the web `<Textarea>` API:
 * variant, error, rows, className.
 */
export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  {
    variant = "default",
    error,
    rows = 3,
    className,
    containerClassName,
    helperText,
    label,
    onFocus,
    onBlur,
    editable = true,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  const stateClass = error
    ? "border-danger"
    : focused
      ? variantFocused[variant]
      : "";

  return (
    <View className="gap-1">
      {label ? (
        <Text className="text-sm font-medium text-fg leading-snug">
          {label}
        </Text>
      ) : null}
      <View
        className={cx(
          "px-4 py-3 rounded-2xl",
          variantBase[variant],
          stateClass,
          !editable && "opacity-50",
          containerClassName,
        )}
      >
        <TextInput
          ref={ref}
          multiline
          numberOfLines={rows}
          editable={editable}
          textAlignVertical="top"
          placeholderTextColor="#a8a29e"
          aria-invalid={error ? true : undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className={cx("text-base text-fg", className)}
          style={{ minHeight: rows * 20 }}
          {...props}
        />
      </View>
      {helperText ? (
        <Text
          className={cx(
            "text-xs leading-snug",
            error ? "text-danger" : "text-fg-muted",
          )}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});
