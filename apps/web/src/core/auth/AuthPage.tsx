import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms/useApiForm";
import { messages } from "@shared/i18n/uk";
import { estimatePasswordStrength } from "@shared/lib/auth/passwordStrength";
import { BrandLogo } from "../app/BrandLogo";
import { useAuth } from "./AuthContext";

// Зод-схеми тримаємо поряд з AuthPage, бо вони вузько-локальні (не
// використовуються більше ніде). Окремий пакет `@sergeant/auth-schemas`
// був би оверкіл-ом для двох форм. Меседжі — з `messages.validation.*`
// (`apps/web/src/shared/i18n/uk.ts`), див. AGENTS.md (Hard Rule #15) і
// `docs/i18n/readiness.md`.
const loginSchema = z.object({
  email: z
    .string()
    .min(1, messages.validation.emailRequired)
    .email(messages.validation.emailInvalid),
  // На login-у ми не нав'язуємо мінімальну довжину пароля — користувач
  // міг створити акаунт у епоху 6-символьного мінімуму, а потім стандарт
  // підняли. Перевірка відбувається на сервері; форма просто гарантує,
  // що поле не порожнє.
  password: z.string().min(1, messages.validation.passwordRequired),
});
type LoginValues = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  email: z
    .string()
    .min(1, messages.validation.emailRequired)
    .email(messages.validation.emailInvalid),
  password: z
    .string()
    .min(10, messages.validation.passwordMin10)
    // Better Auth-у достатньо просто довжини, але натякаємо
    // користувачеві, що 10+ символів — нижня межа надійності.
    .max(128, messages.validation.passwordMax128),
  // Імʼя — опціональне; якщо не введене, fallback на `email.split("@")[0]`
  // нижче в `onSubmit`. Залишаємо пустий рядок як валідне значення, щоб
  // RHF не показав помилку «обовʼязкове поле» — це необовʼязкове.
  name: z.string().max(80, messages.validation.nameMax80).optional(),
});
type RegisterValues = z.infer<typeof registerSchema>;

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  // PR-15 / §C8 — entropy-aware ladder. Замінює naive довжина-only оцінку,
  // що однаково вважала надійним і `aaaaaaaaaa`, і `Aa1!Aa1!Aa`. Лейбли —
  // bare-string (rule scope: тільки JSX-літерали), окремий i18n-namespace
  // не виправдано для трьох коротких токенів.
  const { level } = estimatePasswordStrength(password);
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
      <p className={cn("text-meta font-medium", labelColors[level])}>
        {labels[level]}
      </p>
    </div>
  );
}

interface PasswordVisibilityToggleProps {
  visible: boolean;
  onToggle: () => void;
}

function PasswordVisibilityToggle({
  visible,
  onToggle,
}: PasswordVisibilityToggleProps) {
  // ≥44×44 hit-area (WCAG 2.5.5 / Apple HIG): icon 20px + p-3 (12px) на
  // кожен бік → 44×44 інтерактивна площа. Сусідній Input має мати
  // `pr-12` (48 px) — рівно ширина кнопки + 4 px відступу від краю.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Сховати пароль" : "Показати пароль"}
      aria-pressed={visible}
      className="absolute inset-y-0 right-1 inline-flex items-center justify-center p-3 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-xl"
    >
      <Icon name={visible ? "eye-off" : "eye"} size="lg" />
    </button>
  );
}

interface FieldErrorProps {
  id?: string;
  message: string | undefined;
}

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-meta text-error" role="alert">
      {message}
    </p>
  );
}

interface LoginFormProps {
  onForgotPassword: (currentEmail: string) => void;
  showForgot: boolean;
}

function LoginForm({ onForgotPassword, showForgot }: LoginFormProps) {
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
    formState,
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
        throw new Error("");
      }
      return ok;
    },
    onSuccess: () => {
      toast.success("Вхід виконано");
    },
  });

  // Стежимо за поточним email у полі — потрібен `<button "Забули пароль">`,
  // щоб попередньо заповнити email у форму скидання пароля.
  const emailValue = formState.defaultValues?.email ?? "";

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
          disabled={isSubmitting}
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
            className="text-xs text-brand-strong dark:text-brand-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
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
      </div>

      {/* `authError` тримає локалізоване повідомлення з Better Auth
          (translateAuthError). Не робимо `serverError` з useApiForm,
          щоб не дублювати джерело істини — auth context сам володіє
          серверною помилкою (login + Google + reset). */}
      {authError && !showForgot && (
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
        {isSubmitting ? messages.loadingActions.signingIn : "Увійти"}
      </Button>
    </form>
  );
}

interface RegisterFormProps {
  onAlreadyRegistered: () => void;
}

function RegisterForm({ onAlreadyRegistered }: RegisterFormProps) {
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

interface AuthPageProps {
  onContinueWithoutAccount?: () => void;
}

export function AuthPage({ onContinueWithoutAccount }: AuthPageProps) {
  const { loginWithGoogle, requestPasswordReset, authError, setAuthError } =
    useAuth();
  const { CelebrationComponent } = useCelebration();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  // "idle" → панель рендерить reset-форму; "sending" — кнопка
  // disabled під час запиту; "sent" — заміняє форму нейтральним
  // confirmation (без enumeration hint-у), щоб користувач знав
  // перевірити інбокс.
  const [forgotState, setForgotState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
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
    const target = (forgotEmail || "").trim();
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

  const openForgotPanel = (currentEmail: string) => {
    setAuthError(null);
    setForgotState("idle");
    setForgotEmail((cur) => cur || currentEmail || "");
    setShowForgot((v) => !v);
  };

  // Авто-згортання forgot-панелі після успіху (UX roast 2026-Q2 A14):
  // confirmation-параграф висить безкінечно без цього — юзер не
  // розуміє, що робити далі. Після 6 сек бездіяльності закриваємо
  // панель і повертаємо логін-форму як default state. Кнопка «Назад до
  // входу» дає ручний вихід раніше (`closeForgotPanel`).
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (showForgot && forgotState === "sent") {
      autoCloseTimerRef.current = setTimeout(() => {
        setShowForgot(false);
        setForgotState("idle");
        setAuthError(null);
      }, 6000);
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [showForgot, forgotState, setAuthError]);

  const closeForgotPanel = () => {
    setShowForgot(false);
    setForgotState("idle");
    setAuthError(null);
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
                onForgotPassword={openForgotPanel}
                showForgot={showForgot}
              />
            ) : (
              <RegisterForm
                key="register"
                onAlreadyRegistered={onAlreadyRegistered}
              />
            )}

            {showForgot && mode === "login" && (
              <div
                role="group"
                aria-label="Скидання пароля"
                className="text-xs text-text bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3 leading-relaxed space-y-2"
              >
                {forgotState === "sent" ? (
                  <div className="space-y-3">
                    <p>
                      Якщо такий email зареєстровано — ми відправили лист із
                      посиланням для скидання пароля. Перевір вхідні та папку
                      «Спам». Локальні дані на пристрої залишаються без змін.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={closeForgotPanel}
                      className="w-full"
                    >
                      Назад до входу
                    </Button>
                  </div>
                ) : (
                  <>
                    <p>
                      Введи email акаунту — пришлемо посилання для скидання
                      пароля. Локальні дані на пристрої залишаються без змін.
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
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- only input in forgot panel; auto-focus avoids extra click after expanding it
                      autoFocus
                      disabled={forgotState === "sending"}
                      aria-describedby={
                        authError ? "auth-forgot-email-error" : undefined
                      }
                    />
                    {authError && (
                      <p
                        id="auth-forgot-email-error"
                        role="alert"
                        className="text-error text-meta font-medium"
                      >
                        {authError}
                      </p>
                    )}
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
              disabled={googleLoading}
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
