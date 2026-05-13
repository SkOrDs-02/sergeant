import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms/useApiForm";
import { messages } from "@shared/i18n/uk";
import { BrandLogo } from "../app/BrandLogo";
import { resetPassword } from "./authClient";

/**
 * Зод-схема — локальна, як у `AuthPage`. Меседжі — з
 * `messages.validation.*` (`apps/web/src/shared/i18n/uk.ts`), див.
 * `docs/i18n/readiness.md`. `confirm` валідуємо через `superRefine`
 * після парсу — стандартний react-hook-form pattern для cross-field
 * перевірок.
 */
const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, messages.validation.passwordResetMin10)
      .max(128, messages.validation.passwordMax128),
    confirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.confirm !== data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm"],
        message: messages.validation.passwordsDontMatchDot,
      });
    }
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Landing page for the Better Auth password-reset magic link. The email
 * we send contains `<origin>/reset-password?token=...`; here we read the
 * token, let the user pick a new password, and call `resetPassword`.
 *
 * Kept intentionally minimal (no design system overlays or hub chrome)
 * so that even a user without local Sergeant data can land on this
 * route and recover their account.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  // `useApiForm` зводить валідацію + isSubmitting + server-error mapping
  // в один hook. Better Auth повертає помилку через `result.error` поле,
  // а не через `throw`, тому ми штучно кидаємо `Error(message)`, щоб
  // `useApiForm.serverError` його підхопив.
  const { register, submit, formState, isSubmitting, serverError } = useApiForm<
    ResetPasswordValues,
    true
  >({
    schema: resetPasswordSchema,
    defaultValues: { password: "", confirm: "" },
    onSubmit: async (values) => {
      const result = await resetPassword({
        token,
        newPassword: values.password,
      });
      if (result?.error) {
        throw new Error(
          result.error.message ||
            "Не вдалося скинути пароль. Посилання могло вже бути використане.",
        );
      }
      return true as const;
    },
    onSuccess: () => {
      toast.success("Пароль оновлено");
      window.setTimeout(() => navigate("/sign-in", { replace: true }), 1500);
    },
  });

  const status = formState.isSubmitSuccessful
    ? "done"
    : isSubmitting
      ? "sending"
      : "idle";

  return (
    <div
      className="min-h-dvh bg-bg flex flex-col items-center justify-center px-5"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <BrandLogo as="h1" size="md" className="justify-center" />
        </div>

        <Card variant="elevated" radius="xl" padding="lg" className="space-y-5">
          <div className="text-center">
            <h2 className="text-style-title text-text">Новий пароль</h2>
            <p className="text-xs text-subtle mt-1">
              Встанови новий пароль для свого акаунта.
            </p>
          </div>

          {!token ? (
            <div
              role="alert"
              className="text-sm text-text bg-error/10 border border-error/30 rounded-xl px-4 py-3 leading-relaxed space-y-3"
            >
              <p>
                Посилання на скидання пароля неповне або протерміноване. Відкрий
                останній лист повністю або запроси новий на сторінці входу.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => navigate("/sign-in", { replace: true })}
              >
                На сторінку входу
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="reset-password-new"
                  className="block text-style-caption text-muted mb-1.5"
                >
                  Новий пароль
                </label>
                <Input
                  id="reset-password-new"
                  type="password"
                  placeholder="Мінімум 10 символів"
                  autoComplete="new-password"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- standalone reset page, first required input
                  autoFocus
                  error={!!formState.errors.password}
                  aria-invalid={!!formState.errors.password}
                  aria-describedby={
                    formState.errors.password ? "reset-pw-error" : undefined
                  }
                  disabled={isSubmitting || status === "done"}
                  {...register("password")}
                />
                {formState.errors.password?.message && (
                  <p
                    id="reset-pw-error"
                    role="alert"
                    className="text-xs text-danger"
                  >
                    {formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="reset-password-confirm"
                  className="block text-style-caption text-muted mb-1.5"
                >
                  Підтвердження
                </label>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  placeholder="Введи пароль ще раз"
                  autoComplete="new-password"
                  error={!!formState.errors.confirm}
                  aria-invalid={!!formState.errors.confirm}
                  aria-describedby={
                    formState.errors.confirm ? "reset-confirm-error" : undefined
                  }
                  disabled={isSubmitting || status === "done"}
                  {...register("confirm")}
                />
                {formState.errors.confirm?.message && (
                  <p
                    id="reset-confirm-error"
                    role="alert"
                    className="text-xs text-danger"
                  >
                    {formState.errors.confirm.message}
                  </p>
                )}
              </div>

              {(serverError || status === "done") && (
                <div
                  role={serverError ? "alert" : "status"}
                  className={
                    serverError
                      ? "text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5"
                      : "text-xs text-text bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-2.5"
                  }
                >
                  {serverError || "Пароль оновлено. Зараз перенесу на вхід…"}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={status === "sending"}
                className="w-full"
                disabled={status === "done"}
              >
                {status === "sending"
                  ? "Зберігаю…"
                  : status === "done"
                    ? "Готово"
                    : "Встановити новий пароль"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
