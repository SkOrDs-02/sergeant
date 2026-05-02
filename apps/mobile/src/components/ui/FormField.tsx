/**
 * FormField — wrapper component for form inputs with consistent layout.
 *
 * Provides label, optional hint, error message display, and character counter.
 * Works with any child input component (Input, Textarea, Select, etc.).
 *
 * Usage:
 *   <FormField label="Email" required error={errors.email} hint="We won't share">
 *     <Input value={email} onChangeText={setEmail} />
 *   </FormField>
 */
import { type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { AlertCircle, Info } from "lucide-react-native";

import { colors } from "@/theme";

export interface FormFieldProps {
  /** Label text displayed above the input */
  label: string;
  /** Whether the field is required (shows * indicator) */
  required?: boolean;
  /** Hint text displayed below the label */
  hint?: string;
  /** Error message - when present, field shows error state */
  error?: string | null;
  /** Current character count for inputs with maxLength */
  charCount?: number;
  /** Max character limit for counter display */
  maxLength?: number;
  /** Child input component(s) */
  children: ReactNode;
  /** Additional className for the container */
  className?: string;
  /** Test ID for testing */
  testID?: string;
}

export function FormField({
  label,
  required = false,
  hint,
  error,
  charCount,
  maxLength,
  children,
  className = "",
  testID,
}: FormFieldProps) {
  const showCounter =
    typeof charCount === "number" && typeof maxLength === "number";
  const isOverLimit = showCounter && charCount > maxLength;
  const hasError = !!error;

  return (
    <View className={`gap-1.5 ${className}`} testID={testID}>
      {/* Label row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          <Text className="text-sm font-medium text-fg">{label}</Text>
          {required && <Text className="text-danger text-sm">*</Text>}
        </View>
        {showCounter && (
          <Text
            className={`text-xs ${
              isOverLimit ? "text-danger font-medium" : "text-fg-muted"
            }`}
          >
            {charCount}/{maxLength}
          </Text>
        )}
      </View>

      {/* Hint text */}
      {hint && !hasError && (
        <View className="flex-row items-center gap-1.5">
          <Info size={12} color={colors.textMuted} strokeWidth={2} />
          <Text className="text-xs text-fg-muted">{hint}</Text>
        </View>
      )}

      {/* Input children */}
      {children}

      {/* Error message with animation */}
      {hasError && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="flex-row items-center gap-1.5"
        >
          <AlertCircle size={14} color={colors.danger} strokeWidth={2} />
          <Text className="text-xs text-danger flex-1">{error}</Text>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * FormSection — groups related form fields with a title.
 */
export interface FormSectionProps {
  /** Section title */
  title: string;
  /** Optional description */
  description?: string;
  /** Child form fields */
  children: ReactNode;
  /** Additional className */
  className?: string;
  /** Test ID */
  testID?: string;
}

export function FormSection({
  title,
  description,
  children,
  className = "",
  testID,
}: FormSectionProps) {
  return (
    <View className={`gap-4 ${className}`} testID={testID}>
      <View className="gap-1">
        <Text className="text-base font-semibold text-fg">{title}</Text>
        {description && (
          <Text className="text-sm text-fg-muted">{description}</Text>
        )}
      </View>
      <View className="gap-4">{children}</View>
    </View>
  );
}

/**
 * FormActions — container for form action buttons.
 */
export interface FormActionsProps {
  children: ReactNode;
  /** Layout direction */
  direction?: "row" | "column";
  /** Alignment */
  align?: "start" | "end" | "center" | "stretch";
  className?: string;
}

export function FormActions({
  children,
  direction = "row",
  align = "end",
  className = "",
}: FormActionsProps) {
  const alignClass = {
    start: "items-start",
    end: "items-end",
    center: "items-center",
    stretch: "items-stretch",
  }[align];

  const directionClass = direction === "row" ? "flex-row" : "flex-col";

  return (
    <View
      className={`gap-3 ${directionClass} ${alignClass} justify-end ${className}`}
    >
      {children}
    </View>
  );
}

export default FormField;
