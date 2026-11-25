/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { FormEvent } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import type { UseForgotPasswordResult } from "./useForgotPassword";

interface ForgotPasswordPanelProps {
  state: UseForgotPasswordResult;
  authError: string | null;
}

export function ForgotPasswordPanel({
  state,
  authError,
}: ForgotPasswordPanelProps) {
  const { forgotState, forgotEmail, setForgotEmail, closePanel, submit } =
    state;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit();
  };

  return (
    <div
      role="group"
      aria-label="Скидання пароля"
      className="text-style-caption text-text bg-brand-500/10 border border-brand-500/30 rounded-panel px-4 py-3 leading-relaxed space-y-2"
    >
      {forgotState === "sent" ? (
        <div className="space-y-3">
          <p>
            Якщо такий email зареєстровано, лист уже надіслано. Перевір і папку
            «Спам».
          </p>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={closePanel}
            className="w-full"
          >
            Назад до входу
          </Button>
        </div>
      ) : (
        // Окрема `<form>`: панель рендериться поза формою логіну (сусід у
        // `AuthPage`), тож без неї Enter у полі нічого не відправляв (ux-49).
        <form onSubmit={handleSubmit} noValidate className="space-y-2">
          <p>
            Пришлю посилання для скидання пароля. Дані на пристрої не зміняться.
          </p>
          <label
            htmlFor="auth-forgot-email"
            className="block text-style-caption text-muted"
          >
            Email для скидання
          </label>
          <Input
            id="auth-forgot-email"
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            placeholder="email@example.com"
            autoComplete="email"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- after user explicitly opens the forgot-panel, focus the single input
            autoFocus
            disabled={forgotState === "sending"}
            aria-describedby={authError ? "auth-forgot-email-error" : undefined}
          />
          {authError && (
            <p
              id="auth-forgot-email-error"
              role="alert"
              className="text-style-caption text-danger-strong dark:text-danger font-medium"
            >
              {authError}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            size="md"
            loading={forgotState === "sending"}
            className="w-full"
          >
            {forgotState === "sending" ? "Надсилаю…" : "Надіслати лист"}
          </Button>
        </form>
      )}
    </div>
  );
}
