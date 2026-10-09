/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import { useAuth } from "./AuthContext";
import { loginSchema, type LoginValues } from "./authSchemas";
import { FieldError, PasswordVisibilityToggle } from "./authFormPrimitives";
import { restoreFocusIfLost } from "./restoreFocusIfLost";

// id блоку з помилкою входу: на нього вказує `aria-describedby` поля пароля.
const LOGIN_ERROR_ID = "auth-login-error";

interface LoginFormProps {
  onForgotPassword: (currentEmail: string) => void;
  showForgot: boolean;
}

export function LoginForm({ onForgotPassword, showForgot }: LoginFormProps) {
  const { login, authError } = useAuth();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);

  // useApiForm зводить isSubmitting / валідацію / dirty-state в один
  // hook. Серверні top-level-помилки сюди НЕ протікають — Better Auth
  // повертає їх через `authError` з `useAuth()`, тож ми просто
  // перекидаємо `Error("")` в `onSubmit`, щоб придушити `onSuccess`.
  const {
    register,
    submit,
    watch,
    setFocus,
    formState: { errors },
    isSubmitting,
  } = useApiForm<LoginValues, boolean>({
    schema: loginSchema,
    defaultValues: { email: "", password: "" },
    onSubmit: async (values) => {
      const ok = await login(values.email, values.password);
      if (!ok) {
        // Кидаємо мовчазний error — він блокує `onSuccess`, але не
        // показується (рендер `serverError` свідомо не приводимо).
        // Реальний текст помилки відображається через `authError`
        // нижче, бо він утримує локалізоване повідомлення Better Auth.
        //
        // Фокус повертаємо в пароль: кнопка сабміту на час запиту
        // `disabled`, і браузер скидає з неї фокус на <body>. Поля лише
        // `readOnly`, тож `setFocus` працює ще до кінця сабміту.
        restoreFocusIfLost(() => setFocus("password"));
        throw new Error("");
      }
      return ok;
    },
    onSuccess: () => {
      toast.success("Вхід виконано");
    },
  });

  // Стежимо за поточним email у полі — потрібен `<button "Забули пароль">`,
  // щоб попередньо заповнити email у форму скидання пароля. `watch("email")`
  // повертає live-значення інпута; `formState.defaultValues` тримало б лише
  // початкові дефолти ("") і ніколи б не оновлювалось під час набору.
  const emailValue = watch("email") ?? "";

  // Помилка входу (401 тощо) стосується пари email+пароль; позначаємо поле
  // пароля невалідним і привʼязуємо до нього текст помилки (role=alert нижче).
  // Поки відкрита панель «Забули пароль», помилку не показуємо, тож і
  // aria-invalid/aria-describedby не ставимо, щоб не вказувати в порожнечу.
  const loginError = authError && !showForgot ? authError : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
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
          // eslint-disable-next-line jsx-a11y/no-autofocus -- login form: first required input, expected UX for auth pages
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
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="auth-password"
            className="block text-style-caption text-muted"
          >
            Пароль
          </label>
          <button
            type="button"
            onClick={() => onForgotPassword(emailValue)}
            className="text-style-caption text-brand-strong dark:text-brand-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded px-1"
          >
            Забули пароль?
          </button>
        </div>
        <div className="relative">
          <Input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="Пароль"
            autoComplete="current-password"
            className="pr-12"
            error={!!errors.password || !!loginError}
            aria-invalid={!!errors.password || !!loginError}
            aria-describedby={
              errors.password
                ? "auth-pw-error"
                : loginError
                  ? LOGIN_ERROR_ID
                  : undefined
            }
            readOnly={isSubmitting}
            {...register("password")}
          />
          <PasswordVisibilityToggle
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>
        <FieldError id="auth-pw-error" message={errors.password?.message} />
      </div>

      {/* `authError` тримає локалізоване повідомлення з Better Auth
          (translateAuthError). Не робимо `serverError` з useApiForm,
          щоб не дублювати джерело істини — auth context сам володіє
          серверною помилкою (login + Google + reset). */}
      {loginError && (
        <div
          id={LOGIN_ERROR_ID}
          role="alert"
          className="text-style-caption text-danger-strong dark:text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-2.5"
        >
          {loginError}
        </div>
      )}

      <Button
        type="submit"
        variant="solid"
        size="lg"
        loading={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? messages.loadingActions.signingIn : "Увійти"}
      </Button>
    </form>
  );
}
