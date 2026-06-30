import { useState } from "react";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { useApiForm } from "@shared/forms/useApiForm";
import { messages } from "@shared/i18n/uk";

const tokenSchema = z.object({
  token: z.string().trim().min(1, "Введіть токен Monobank API"),
});
type TokenValues = z.infer<typeof tokenSchema>;

export interface FinykLoginScreenProps {
  showToken?: boolean;
  authError: string | null;
  error: string | null;
  connecting: boolean;
  /** Called with the trimmed validated token when the form is submitted. */
  onConnect: (token: string) => void;
  onContinueWithoutBank: () => void;
  onBackToHub?: () => void;
  /** Override the back-button label. Defaults to "Назад до хабу" (top-level use). */
  backLabel?: string;
}

/**
 * Login screen for Finyk module.
 *
 * Shown when the user has neither a Monobank token (`!clientInfo`) nor a
 * "manual only" bypass set. Lets the user paste a Mono API token or proceed
 * without a bank connection (manual expenses only). The token is sent
 * server-side via the Monobank webhook flow — there is no longer a
 * "remember on this device" checkbox because tokens are never persisted in
 * the browser after the legacy polling cleanup.
 *
 * F7 (2026-06-03): migrated from manual `tokenInput` / `onTokenInputChange`
 * prop-drilling to `useApiForm` (zod resolver). `onConnect` now receives the
 * validated token string; callers no longer need to track the input value.
 */
export function FinykLoginScreen({
  authError,
  error,
  connecting,
  onConnect,
  onContinueWithoutBank,
  onBackToHub,
  backLabel = "Назад до хабу",
}: FinykLoginScreenProps) {
  const [showTokenVisible, setShowTokenVisible] = useState(false);

  const {
    register,
    submit,
    watch,
    setValue,
    formState,
    isSubmitting,
    serverError,
  } = useApiForm<TokenValues>({
    schema: tokenSchema,
    defaultValues: { token: "" },
    onSubmit: async (values) => {
      // Pass the validated + trimmed token up to the parent. The parent
      // calls `connect(token)` which is async; we do not await it here so
      // the parent's `connecting` prop drives the loading state below.
      onConnect(values.token);
    },
    formOptions: { mode: "onTouched" },
  });

  const tokenValue = watch("token") ?? "";

  return (
    <div className="min-h-dvh flex items-center justify-center p-5 bg-bg safe-area-pt-pb">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className={cn(
              "w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-4",
              "bg-linear-to-br from-brand-100 to-brand-200",
              "dark:from-brand-900/40 dark:to-brand-800/30",
              "border border-brand-soft-border/60",
              "shadow-card",
            )}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-strong dark:text-brand"
              aria-hidden
            >
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <h1 className="text-style-hero text-text">ФІНІК</h1>
          <p className="text-sm text-muted mt-1">
            Персональний фінансовий менеджер
          </p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className={cn(
            "bg-panel/95 backdrop-blur-xl border rounded-3xl p-6 shadow-float",
            "border-line dark:border-line",
          )}
        >
          <label
            className="text-sm text-muted mb-2 block"
            htmlFor="finyk-mono-token"
          >
            API токен Monobank
          </label>
          <p className="text-xs text-subtle mb-2">
            Mono → Налаштування → Інші → API
          </p>
          <div className="relative mt-1">
            <Input
              id="finyk-mono-token"
              className="pr-20"
              type={showTokenVisible ? "text" : "password"}
              placeholder="Вставте токен Mono API"
              autoComplete="off"
              aria-invalid={!!formState.errors.token}
              aria-describedby={
                formState.errors.token ? "finyk-token-error" : undefined
              }
              {...register("token")}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 p-0 border-0"
              aria-label="Вставити з буфера обміну"
              title="Вставити з буфера"
              onClick={async () => {
                try {
                  const text = (await navigator.clipboard.readText()).trim();
                  // Use RHF setValue so the form's internal state + validation
                  // are updated alongside the DOM input value.
                  setValue("token", text, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  });
                } catch {
                  // Clipboard read can fail on permissions or in test envs.
                  // The user can still paste manually.
                }
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 border-0"
              aria-label={
                showTokenVisible ? "Приховати токен" : "Показати токен"
              }
              onClick={() => setShowTokenVisible((v) => !v)}
            >
              {showTokenVisible ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </Button>
          </div>

          {formState.errors.token && (
            <p
              id="finyk-token-error"
              className="mt-1.5 text-xs text-danger-strong"
              role="alert"
            >
              {formState.errors.token.message}
            </p>
          )}

          <p className="text-xs text-subtle mt-2">
            Токен відправляється на сервер і не зберігається у браузері.
          </p>

          {authError && (
            <div className="mt-3 text-sm bg-warning/15 border border-warning/40 rounded-xl px-3 py-2.5 space-y-1">
              <p className="font-semibold text-text">
                Токен потребує оновлення
              </p>
              <p className="text-xs text-muted">{authError}</p>
              <p className="text-xs text-muted">
                Отримайте новий токен: Monobank → Налаштування → API
              </p>
            </div>
          )}
          {/* Server-level error (from useApiForm) or parent-provided error */}
          {(serverError || (error && !authError)) && (
            <p
              className="mt-3 text-sm text-danger-strong dark:text-danger bg-danger/10 rounded-xl px-3 py-2"
              role="alert"
            >
              {serverError ?? error}
            </p>
          )}

          <Button
            type="submit"
            className={cn(
              "mt-4 w-full h-12 min-h-[48px] text-base border-0",
              "bg-linear-to-r from-brand-strong to-brand-800",
              "hover:from-brand-800 hover:to-brand-800",
              "text-white font-semibold",
              "shadow-md hover:shadow-glow",
              "transition-[background-color,box-shadow,opacity,transform] duration-200",
              "active:scale-[0.98]",
            )}
            disabled={connecting || isSubmitting || !tokenValue.trim()}
          >
            {connecting || isSubmitting
              ? messages.loadingActions.connecting
              : "Підключити Monobank"}
          </Button>

          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
              "або" divider row — structurally a delimiter
              between two bg-line spans, not a heading. */}
          <div className="my-4 flex items-center gap-3 text-xs text-muted uppercase tracking-wider">
            <span className="flex-1 h-px bg-line" />
            або
            <span className="flex-1 h-px bg-line" />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full min-h-[48px]"
            onClick={onContinueWithoutBank}
          >
            Почати без банку
          </Button>
          <p className="mt-2 text-center text-xs text-subtle">
            Ручні витрати, бюджети та аналітика — без API-токена. Monobank можна
            підключити пізніше.
          </p>
          {typeof onBackToHub === "function" && (
            <Button
              type="button"
              variant="secondary"
              className="mt-1 w-full min-h-[44px]"
              onClick={onBackToHub}
            >
              ← {backLabel}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
