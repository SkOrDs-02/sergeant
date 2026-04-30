import { useState, type FormEvent, type SyntheticEvent } from "react";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { useToast } from "@shared/hooks/useToast";
import { BrandLogo } from "../app/BrandLogo";
import { useAuth } from "./AuthContext";

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const len = password.length;
  const level = len < 6 ? 0 : len < 10 ? 1 : 2;
  const widths = ["w-1/3", "w-2/3", "w-full"];
  const colors = ["bg-error", "bg-amber-400", "bg-brand-500"];
  const labels = ["Слабкий", "Середній", "Надійний"];
  const labelColors = [
    "text-error",
    "text-amber-500",
    "text-brand-strong dark:text-brand",
  ];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1 rounded-full bg-line overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            widths[level],
            colors[level],
          )}
        />
      </div>
      <p className={cn("text-[11px] font-medium", labelColors[level])}>
        {labels[level]}
      </p>
    </div>
  );
}

interface AuthPageProps {
  onContinueWithoutAccount?: () => void;
}

export function AuthPage({ onContinueWithoutAccount }: AuthPageProps) {
  const {
    login,
    loginWithGoogle,
    register,
    requestPasswordReset,
    authError,
    setAuthError,
  } = useAuth();
  const toast = useToast();
  const { achievement, CelebrationComponent } = useCelebration();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  // "idle" → the panel renders the reset form; "sending" disables the
  // button while the request flies; "sent" replaces the form with a
  // neutral confirmation (no enumeration hints) so the user knows to
  // check their inbox.
  const [forgotState, setForgotState] = useState("idle");
  const [forgotEmail, setForgotEmail] = useState("");

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setAuthError(null);
    setShowForgot(false);
    setForgotState("idle");
    setForgotEmail("");
  };

  const handleForgotSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const target = (forgotEmail || email || "").trim();
    if (!target) {
      setAuthError("Введи email, на який відправити лист.");
      return;
    }
    setForgotState("sending");
    const ok = await requestPasswordReset(target);
    setForgotState(ok ? "sent" : "idle");
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await loginWithGoogle();
    // У сценарії success браузер вже перейшов на Google і цей код не
    // виконається. Скидаємо локальний спіннер тільки на випадок, якщо
    // OAuth не запустився (помилка вже в `authError`).
    setGoogleLoading(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    if (mode === "login") {
      const ok = await login(email, password);
      if (ok) toast.success("Вхід виконано");
    } else {
      const ok = await register(email, password, name || email.split("@")[0]);
      if (ok) {
        achievement(
          "Ласкаво просимо!",
          "Твій акаунт створено. Тепер дані синхронізуються між пристроями.",
          [
            { icon: "🔐", label: "Захищений акаунт" },
            { icon: "🔄", label: "Синхронізація" },
          ],
        );
      } else if (authError && /вже зареєстровано/i.test(authError)) {
        setMode("login");
      }
    }
    setLoading(false);
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
              <h2 className="text-lg font-bold text-text">
                {mode === "login" ? "Вхід в акаунт" : "Створення акаунту"}
              </h2>
              <p className="text-xs text-subtle mt-1">
                {mode === "login"
                  ? "Email і пароль або Google"
                  : "Email і пароль — мінімум 10 символів"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-medium text-muted mb-1.5"
                  >
                    Ім{"'"}я
                  </label>
                  <Input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={"Твоє ім'я"}
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-muted mb-1.5"
                >
                  Email
                </label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="email@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-muted"
                  >
                    Пароль
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthError(null);
                        setForgotState("idle");
                        setForgotEmail((cur) => cur || email || "");
                        setShowForgot((v) => !v);
                      }}
                      className="text-xs text-brand-strong dark:text-brand-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
                    >
                      Забули пароль?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 10 : 1}
                    placeholder={
                      mode === "register" ? "Мінімум 10 символів" : "Пароль"
                    }
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Приховати пароль" : "Показати пароль"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
                  >
                    {showPassword ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {mode === "register" && (
                  <PasswordStrengthBar password={password} />
                )}
              </div>

              {showForgot && (
                <div
                  role="group"
                  aria-label="Скидання пароля"
                  className="text-xs text-text bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3 leading-relaxed space-y-2"
                >
                  {forgotState === "sent" ? (
                    <p>
                      Якщо такий email зареєстровано — ми відправили лист із
                      посиланням для скидання пароля. Перевір вхідні та папку
                      «Спам». Локальні дані на пристрої залишаються без змін.
                    </p>
                  ) : (
                    <>
                      <p>
                        Введи email акаунту — пришлемо посилання для скидання
                        пароля. Локальні дані на пристрої залишаються без змін.
                      </p>
                      <label
                        htmlFor="auth-forgot-email"
                        className="block text-xs font-medium text-muted"
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
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        loading={forgotState === "sending"}
                        onClick={handleForgotSubmit}
                        className="w-full"
                      >
                        {forgotState === "sending"
                          ? "Надсилаю…"
                          : "Надіслати лист"}
                      </Button>
                    </>
                  )}
                </div>
              )}

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
                loading={loading}
                className="w-full"
              >
                {loading
                  ? "Зачекайте…"
                  : mode === "login"
                    ? "Увійти"
                    : "Зареєструватися"}
              </Button>
            </form>

            {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
            Inline "або" divider between two <span> rules — structurally
            a delimiter, not a heading, so SectionHeading is the wrong
            abstraction. */}
            <div className="my-6 flex items-center gap-3 text-xs text-muted uppercase tracking-wider">
              <span className="flex-1 h-px bg-line" />
              або
              <span className="flex-1 h-px bg-line" />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              loading={googleLoading}
              disabled={loading || googleLoading}
              onClick={handleGoogleSignIn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Увійти через Google
            </Button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={switchMode}
                className="text-sm text-brand-strong dark:text-brand-400 hover:underline px-2 py-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
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
