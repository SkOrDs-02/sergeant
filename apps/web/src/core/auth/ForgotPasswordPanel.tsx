import type { SyntheticEvent } from "react";
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

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <div
      role="group"
      aria-label="Скидання пароля"
      className="text-xs text-text bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3 leading-relaxed space-y-2"
    >
      {forgotState === "sent" ? (
        <div className="space-y-3">
          <p>
            Якщо такий email зареєстровано — ми відправили лист із посиланням
            для скидання пароля. Перевір вхідні та папку «Спам». Локальні дані
            на пристрої залишаються без змін.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={closePanel}
            className="w-full"
          >
            Назад до входу
          </Button>
        </div>
      ) : (
        <>
          <p>
            Введи email акаунту — пришлемо посилання для скидання пароля.
            Локальні дані на пристрої залишаються без змін.
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
          />
          {authError && (
            <p role="alert" className="text-error text-meta font-medium">
              {authError}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={forgotState === "sending"}
            onClick={handleSubmit}
            className="w-full"
          >
            {forgotState === "sending" ? "Надсилаю…" : "Надіслати лист"}
          </Button>
        </>
      )}
    </div>
  );
}
