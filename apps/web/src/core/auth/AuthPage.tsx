import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { BrandLogo } from "../app/BrandLogo";
import { useAuth } from "./AuthContext";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { useForgotPassword } from "./useForgotPassword";

interface AuthPageProps {
  onContinueWithoutAccount?: () => void;
}

export function AuthPage({ onContinueWithoutAccount }: AuthPageProps) {
  const { loginWithGoogle, authError, setAuthError } = useAuth();
  const { CelebrationComponent } = useCelebration();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [googleLoading, setGoogleLoading] = useState(false);
  const forgot = useForgotPassword();

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setAuthError(null);
    forgot.closePanel();
    forgot.setForgotEmail("");
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await loginWithGoogle();
    // У сценарії success браузер вже перейшов на Google і цей код не
    // виконається. Скидаємо локальний спіннер тільки на випадок, якщо
    // OAuth не запустився (помилка вже в `authError`).
    setGoogleLoading(false);
  };

  const onAlreadyRegistered = () => {
    setMode("login");
  };

  return (
    <>
      {CelebrationComponent}
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

          <Card
            variant="elevated"
            radius="xl"
            padding="lg"
            className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
          >
            <div className="text-center">
              <h2 className="text-style-title text-text">
                {mode === "login" ? "Вхід в акаунт" : "Створення акаунту"}
              </h2>
              <p className="text-xs text-subtle mt-1">
                {mode === "login"
                  ? "Email і пароль або Google"
                  : "Email і пароль — мінімум 10 символів"}
              </p>
            </div>

            {/*
              `key={mode}` re-mount-ить форму при зміні режиму. Це
              надійніший шлях, ніж намагатися переключити schema на
              льоту: `useApiForm` фіксує zod-resolver під час mount-у,
              і RHF не перевалідовує існуючі поля при зміні
              `defaultValues`. Зайвих ререндерів немає — користувач
              перемикає режим явно через кнопку «Немає акаунту?».
            */}
            {mode === "login" ? (
              <LoginForm
                key="login"
                onForgotPassword={forgot.openPanel}
                showForgot={forgot.showForgot}
              />
            ) : (
              <RegisterForm
                key="register"
                onAlreadyRegistered={onAlreadyRegistered}
              />
            )}

            {forgot.showForgot && mode === "login" && (
              <ForgotPasswordPanel state={forgot} authError={authError} />
            )}

            {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
            Inline "або" divider between two <span> rules — structurally
            a delimiter, not a heading, so SectionHeading is the wrong
            abstraction. */}
            <div className="my-6 flex items-center gap-3 text-xs text-muted uppercase tracking-wider">
              <span className="flex-1 h-px bg-line" />
              або
              <span className="flex-1 h-px bg-line" />
            </div>

            <GoogleSignInButton
              loading={googleLoading}
              onClick={handleGoogleSignIn}
            />

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={switchMode}
                className="text-sm text-brand-strong dark:text-brand-400 hover:underline px-2 py-1 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
              >
                {mode === "login"
                  ? "Немає акаунту? Зареєструватися"
                  : "Вже є акаунт? Увійти"}
              </button>
            </div>
          </Card>

          {typeof onContinueWithoutAccount === "function" && (
            <div className="mt-4 space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="w-full"
                onClick={onContinueWithoutAccount}
              >
                Поки що пропустити
              </Button>
              <p className="text-center text-xs text-subtle leading-relaxed px-2">
                Все працює локально. Акаунт потрібен лише для синхронізації між
                пристроями.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
