/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import { useAuth } from "./AuthContext";
import { registerSchema, type RegisterValues } from "./authSchemas";
import {
  FieldError,
  PasswordStrengthBar,
  PasswordVisibilityToggle,
} from "./authFormPrimitives";
import { restoreFocusIfLost } from "./restoreFocusIfLost";

interface RegisterFormProps {
  /**
   * sec-46: сервер сесії не видав, далі екран «Перевір пошту». Та сама
   * відповідь і для нової, і для зайнятої адреси, тож форма їх не розрізняє.
   */
  onCheckEmail: (email: string) => void;
}

export function RegisterForm({ onCheckEmail }: RegisterFormProps) {
  const { register: signup, authError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    submit,
    setFocus,
    formState: { errors },
    isSubmitting,
    watch,
  } = useApiForm<RegisterValues, boolean>({
    schema: registerSchema,
    defaultValues: { email: "", password: "", name: "" },
    onSubmit: async (values) => {
      const fallbackName = values.email.split("@")[0] ?? "";
      const result = await signup(
        values.email,
        values.password,
        values.name?.trim() || fallbackName,
      );
      if (result === "check-email") {
        onCheckEmail(values.email.trim());
        return true;
      }
      if (result !== true) {
        // Кнопка сабміту на час запиту `disabled`, і браузер скидає з неї
        // фокус на <body>; поля лише `readOnly` і фокус зберігають.
        restoreFocusIfLost(() => setFocus("email"));
        throw new Error("");
      }
      return true;
    },
  });

  const passwordValue = watch("password") ?? "";

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label
          htmlFor="auth-name"
          className="block text-style-caption text-muted mb-1.5"
        >
          Імʼя
        </label>
        <Input
          id="auth-name"
          type="text"
          placeholder={"Твоє імʼя"}
          autoComplete="name"
          error={!!errors.name}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "auth-name-error" : undefined}
          readOnly={isSubmitting}
          {...register("name")}
        />
        <FieldError id="auth-name-error" message={errors.name?.message} />
      </div>

      <div>
        <label
          htmlFor="auth-email"
          className="block text-style-caption text-muted mb-1.5"
        >
          Email
        </label>
        <Input
          id="auth-email"
          type="email"
          placeholder="email@example.com"
          autoComplete="email"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- signup form: first required input (name is optional)
          autoFocus
          error={!!errors.email}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "auth-email-error" : undefined}
          readOnly={isSubmitting}
          {...register("email")}
        />
        <FieldError id="auth-email-error" message={errors.email?.message} />
      </div>

      <div>
        <label
          htmlFor="auth-password"
          className="block text-style-caption text-muted mb-1.5"
        >
          Пароль
        </label>
        <div className="relative">
          <Input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="Мінімум 10 символів"
            autoComplete="new-password"
            className="pr-12"
            error={!!errors.password}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "auth-pw-error" : undefined}
            readOnly={isSubmitting}
            {...register("password")}
          />
          <PasswordVisibilityToggle
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>
        <FieldError id="auth-pw-error" message={errors.password?.message} />
        <PasswordStrengthBar password={passwordValue} />
      </div>

      {authError && (
        <div
          role="alert"
          className="text-style-caption text-danger-strong dark:text-danger bg-danger/10 border border-danger/20 rounded-panel px-4 py-2.5"
        >
          {authError}
        </div>
      )}

      <Button
        type="submit"
        variant="solid"
        size="lg"
        loading={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? messages.loadingActions.registering : "Зареєструватися"}
      </Button>
    </form>
  );
}
