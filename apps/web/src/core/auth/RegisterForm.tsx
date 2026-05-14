import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { useApiForm } from "@shared/forms/useApiForm";
import { messages } from "@shared/i18n/uk";
import { useAuth } from "./AuthContext";
import { registerSchema, type RegisterValues } from "./authSchemas";
import {
  FieldError,
  PasswordStrengthBar,
  PasswordVisibilityToggle,
} from "./authFormPrimitives";

interface RegisterFormProps {
  onAlreadyRegistered: () => void;
}

export function RegisterForm({ onAlreadyRegistered }: RegisterFormProps) {
  const { register: signup, authError } = useAuth();
  const { achievement } = useCelebration();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    submit,
    formState: { errors },
    isSubmitting,
    watch,
  } = useApiForm<RegisterValues, boolean>({
    schema: registerSchema,
    defaultValues: { email: "", password: "", name: "" },
    onSubmit: async (values) => {
      const fallbackName = values.email.split("@")[0] ?? "";
      const ok = await signup(
        values.email,
        values.password,
        values.name?.trim() || fallbackName,
      );
      if (!ok) {
        // Сценарій «вже зареєстровано» обробляє AuthPage (auto-switch
        // на login). Інші помилки відображає `authError` нижче.
        if (authError && /вже зареєстровано/i.test(authError)) {
          onAlreadyRegistered();
        }
        throw new Error("");
      }
      return ok;
    },
    onSuccess: (_ok, values) => {
      const name = values.name?.trim() || values.email.split("@")[0] || "";
      achievement(
        `Готово, ${name}!`,
        "Твої дані тепер з тобою на всіх пристроях.",
        [
          { icon: "🔐", label: "Захищений акаунт" },
          { icon: "🔄", label: "Синхронізація" },
        ],
      );
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
          Ім{"'"}я
        </label>
        <Input
          id="auth-name"
          type="text"
          placeholder={"Твоє ім'я"}
          autoComplete="name"
          error={!!errors.name}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "auth-name-error" : undefined}
          disabled={isSubmitting}
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
          disabled={isSubmitting}
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
            disabled={isSubmitting}
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
          className="text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5"
        >
          {authError}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? messages.loadingActions.registering : "Зареєструватися"}
      </Button>
    </form>
  );
}
