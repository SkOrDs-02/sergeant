import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { BrandLogo } from "../app/BrandLogo";
import { useAuth } from "./AuthContext";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { AppleSignInButton } from "./AppleSignInButton";
import { useForgotPassword } from "./useForgotPassword";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { LegalLinks } from "../legal/LegalLinks";

interface AuthPageProps {
  onContinueWithoutAccount?: () => void;
}

export function AuthPage({ onContinueWithoutAccount }: AuthPageProps) {
  const { loginWithGoogle, loginWithApple, authError, setAuthError } =
    useAuth();
  const { CelebrationComponent } = useCelebration();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const forgot = useForgotPassword();

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setAuthError(null);
    forgot.closePanel();
  };

  // `surface` дозволяє PostHog розщепити drop-off між sign_in vs sign_up;
  // подія летить ДО редіректу на провайдера, бо після
  // `window.location` redirect React-life-cycle ламається і
  // `trackEvent` може не встигнути долетіти до PostHog (їх SDK
  // дебаунсить flush). Див. ADR-0010 PR-4.3 / `SIGNUP_PROVIDER_SELECTED`
  // payload contract в `packages/shared/src/lib/analyticsEvents.ts`.
  const handleGoogleSignIn = async () => {
    trackEvent(ANALYTICS_EVENTS.SIGNUP_PROVIDER_SELECTED, {
      provider: "google",
      surface: mode === "login" ? "sign_in" : "sign_up",
    });
    setGoogleLoading(true);
    await loginWithGoogle();
    // У сценарії success браузер вже перейшов на Google і цей код не
    // виконається. Скидаємо локальний спіннер тільки на випадок, якщо
    // OAuth не запустився (помилка вже в `authError`).
    setGoogleLoading(false);
  };

  const handleAppleSignIn = async () => {
    trackEvent(ANALYTICS_EVENTS.SIGNUP_PROVIDER_SELECTED, {
      provider: "apple",
      surface: mode === "login" ? "sign_in" : "sign_up",
    });
    setAppleLoading(true);
    await loginWithApple();
    setAppleLoading(false);
  };

  const onAlreadyRegistered = () => {
    setMode("login");
  };

  return (
    <>
      {CelebrationComponent}
      {/*
        Phase 7 D1 — visual refresh. MeshBackground wraps the whole auth
        shell (auth is pre-module, so no `<ModuleAccentProvider>` here);
        BrandLogo sits ABOVE the hero card per the redesign brief.
        Flow logic is intentionally untouched — see
        `docs/design/redesign-v2/phase-7-product-decisions-2026-05-22.md` D1.
      */}
      <MeshBackground
        className="items-center px-5 overflow-y-auto"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="w-full max-w-sm my-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <div className="text-center mb-6">
            <BrandLogo as="h1" size="md" className="justify-center" />
          </div>

          <Card
            prominence="hero"
            radius="r-2xl"
            padding="lg"
            className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
          >
            <div className="text-center">
              <h2 className="text-style-display-hero text-text">
                {mode === "login" ? "З поверненням" : "Створити акаунт"}
              </h2>
              <p className="text-style-body-sm text-subtle mt-2">
                {mode === "login"
                  ? "Email і пароль, Google або Apple"
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
            <div className="my-6 flex items-center gap-3 text-style-overline text-muted">
              <span className="flex-1 h-px bg-line" />
              або
              <span className="flex-1 h-px bg-line" />
            </div>

            <div className="space-y-3">
              <GoogleSignInButton
                loading={googleLoading}
                onClick={handleGoogleSignIn}
              />
              <AppleSignInButton
                loading={appleLoading}
                onClick={handleAppleSignIn}
              />
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={switchMode}
                className="min-h-touch-target text-style-label text-brand-strong dark:text-brand-400 hover:underline px-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
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
                variant="secondary"
                size="md"
                className="w-full"
                onClick={onContinueWithoutAccount}
              >
                Поки що пропустити
              </Button>
              <p className="text-center text-style-caption text-subtle leading-relaxed px-2">
                Все працює локально. Акаунт потрібен лише для синхронізації між
                пристроями.
              </p>
            </div>
          )}

          <LegalLinks compact className="mt-5" />
        </div>
      </MeshBackground>
    </>
  );
}
