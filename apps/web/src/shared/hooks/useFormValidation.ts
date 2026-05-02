import { useState, useCallback, useRef } from "react";
import { hapticError } from "../lib/haptic";

type ValidationRule<T> = {
  validate: (value: T) => boolean;
  message: string;
};

type FieldConfig<T> = {
  rules: ValidationRule<T>[];
  /** Validate on every change (default: false - validate on blur/submit) */
  validateOnChange?: boolean;
};

type FieldState = {
  error: string | null;
  touched: boolean;
  shaking: boolean;
};

type FormConfig<T extends Record<string, unknown>> = {
  [K in keyof T]: FieldConfig<T[K]>;
};

type FormState<T extends Record<string, unknown>> = {
  [K in keyof T]: FieldState;
};

type FormValues<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
};

export interface UseFormValidationReturn<T extends Record<string, unknown>> {
  /** Current field states (error, touched, shaking) */
  fields: FormState<T>;
  /** Get props for an input field */
  getFieldProps: (name: keyof T) => {
    error: boolean;
    className: string;
    onBlur: () => void;
  };
  /** Validate a single field */
  validateField: (name: keyof T, value: T[keyof T]) => boolean;
  /** Validate all fields */
  validateAll: (values: FormValues<T>) => boolean;
  /** Reset all field states */
  reset: () => void;
  /** Check if form has any errors */
  hasErrors: boolean;
  /** Trigger shake animation on a field */
  shakeField: (name: keyof T) => void;
}

/**
 * useFormValidation - Form validation hook with shake animation
 *
 * @example
 * const { fields, getFieldProps, validateAll, shakeField } = useFormValidation({
 *   email: {
 *     rules: [
 *       { validate: v => v.length > 0, message: "Email is required" },
 *       { validate: v => v.includes("@"), message: "Invalid email format" },
 *     ],
 *   },
 *   password: {
 *     rules: [
 *       { validate: v => v.length >= 8, message: "Password must be at least 8 characters" },
 *     ],
 *   },
 * });
 *
 * <Input {...getFieldProps("email")} />
 * {fields.email.error && <span>{fields.email.error}</span>}
 */
export function useFormValidation<T extends Record<string, unknown>>(
  config: FormConfig<T>,
): UseFormValidationReturn<T> {
  const fieldNames = Object.keys(config) as (keyof T)[];

  // Initialize field states
  const initialState = fieldNames.reduce((acc, name) => {
    acc[name] = { error: null, touched: false, shaking: false };
    return acc;
  }, {} as FormState<T>);

  const [fields, setFields] = useState<FormState<T>>(initialState);
  const shakeTimeouts = useRef<Map<keyof T, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const shakeField = useCallback((name: keyof T) => {
    // Clear existing timeout
    const existingTimeout = shakeTimeouts.current.get(name);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Trigger haptic feedback
    hapticError();

    // Start shake
    setFields(
      (prev): FormState<T> => ({
        ...prev,
        [name]: { ...prev[name], shaking: true },
      }),
    );

    // Stop shake after animation completes
    const timeout = setTimeout(() => {
      setFields(
        (prev): FormState<T> => ({
          ...prev,
          [name]: { ...prev[name], shaking: false },
        }),
      );
      shakeTimeouts.current.delete(name);
    }, 500);

    shakeTimeouts.current.set(name, timeout);
  }, []);

  const validateField = useCallback(
    (name: keyof T, value: T[keyof T]): boolean => {
      const fieldConfig = config[name];
      if (!fieldConfig) return true;

      for (const rule of fieldConfig.rules) {
        if (!rule.validate(value)) {
          setFields(
            (prev): FormState<T> => ({
              ...prev,
              [name]: { ...prev[name], error: rule.message, touched: true },
            }),
          );
          return false;
        }
      }

      setFields(
        (prev): FormState<T> => ({
          ...prev,
          [name]: { ...prev[name], error: null, touched: true },
        }),
      );
      return true;
    },
    [config],
  );

  const validateAll = useCallback(
    (values: FormValues<T>): boolean => {
      let isValid = true;
      const newFields = { ...fields };

      for (const name of fieldNames) {
        const fieldConfig = config[name];
        if (!fieldConfig) continue;

        const value = values[name];
        let fieldError: string | null = null;

        for (const rule of fieldConfig.rules) {
          if (!rule.validate(value)) {
            fieldError = rule.message;
            isValid = false;
            break;
          }
        }

        newFields[name] = {
          ...newFields[name],
          error: fieldError,
          touched: true,
        };

        // Shake fields with errors
        if (fieldError) {
          shakeField(name);
        }
      }

      setFields(newFields);
      return isValid;
    },
    [config, fieldNames, fields, shakeField],
  );

  const reset = useCallback(() => {
    setFields(initialState);
    // Clear all shake timeouts
    shakeTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    shakeTimeouts.current.clear();
  }, [initialState]);

  const getFieldProps = useCallback(
    (name: keyof T) => {
      const field = fields[name];
      return {
        error: !!field?.error,
        className: field?.shaking ? "animate-shake" : "",
        onBlur: () => {
          setFields(
            (prev): FormState<T> => ({
              ...prev,
              [name]: { ...prev[name], touched: true },
            }),
          );
        },
      };
    },
    [fields],
  );

  const hasErrors = fieldNames.some((name) => fields[name]?.error != null);

  return {
    fields,
    getFieldProps,
    validateField,
    validateAll,
    reset,
    hasErrors,
    shakeField,
  };
}

// Common validation rules
export const validationRules = {
  required: (message = "This field is required"): ValidationRule<string> => ({
    validate: (v) => v.trim().length > 0,
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (v) => v.length >= min,
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (v) => v.length <= max,
    message: message || `Must be at most ${max} characters`,
  }),

  email: (message = "Invalid email format"): ValidationRule<string> => ({
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message,
  }),

  pattern: (
    regex: RegExp,
    message = "Invalid format",
  ): ValidationRule<string> => ({
    validate: (v) => regex.test(v),
    message,
  }),

  match: (
    getOther: () => string,
    message = "Fields do not match",
  ): ValidationRule<string> => ({
    validate: (v) => v === getOther(),
    message,
  }),

  number: (message = "Must be a number"): ValidationRule<string> => ({
    validate: (v) => !isNaN(Number(v)) && v.trim() !== "",
    message,
  }),

  min: (minValue: number, message?: string): ValidationRule<string> => ({
    validate: (v) => Number(v) >= minValue,
    message: message || `Must be at least ${minValue}`,
  }),

  max: (maxValue: number, message?: string): ValidationRule<string> => ({
    validate: (v) => Number(v) <= maxValue,
    message: message || `Must be at most ${maxValue}`,
  }),
};
