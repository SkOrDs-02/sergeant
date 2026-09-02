/**
 * Last validated: 2026-08-02
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { POST_SUCCESS_REDIRECT_MS } from "@shared/lib/ui/timeouts";
import { BrandLogo } from "../app/BrandLogo";
import { SIGN_IN_PATH } from "../app/appPaths";
import { useAuth } from "./AuthContext";
import { refreshSessionCookieCache } from "./authClient";

/**
 * Better Auth редиректить сюди після `GET /api/auth/verify-email`, дописуючи
 * `?error=<CODE>` при невдачі. Коди — `BASE_ERROR_CODES` із
 * `@better-auth/core/error`; сюди реально доїжджають лише ці чотири.
 *
 * Свій мапер, а не `translateAuthError`: там `USER_NOT_FOUND` мапиться на
 * «Невірний email або пароль» — правильно для форми входу і безглуздо для
 * кліку з листа.
 */
const ERROR_COPY: Readonly<Record<string, string>> = {
  TOKEN_EXPIRED:
    "Посилання протерміноване. Надішли новий лист із профілю, кнопка «Надіслати» біля адреси.",
  INVALID_TOKEN:
    "Посилання пошкоджене або вже використане. Відкрий останній лист повністю або запроси новий у профілі.",
  USER_NOT_FOUND: "Акаунт для цієї адреси не знайдено.",
  INVALID_USER:
    "Посилання належить іншому акаунту. Вийди з поточного і відкрий лист ще раз.",
};

const FALLBACK_ERROR_COPY =
  "Не вдалося підтвердити email. Запроси новий лист у профілі.";

/**
 * Лендинг підтвердження email.
 *
 * Сам факт верифікації вже стався на сервері до цього редиректу — сторінка
 * нічого не «підтверджує», вона показує результат і синхронізує клієнт.
 * Синхронізація — це `refreshSessionCookieCache()` (інакше 5-хвилинний
 * cookie-кеш сесії ще тримає `emailVerified: false`, див. його JSDoc) плюс
 * інвалідація `me`-запиту, щоб бейдж у профілі оновився одразу.
 *
 * Рендериться без хаб-хрому — на цю адресу заходять з поштового клієнта,
 * можливо в іншому браузері й без сесії взагалі.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, status } = useAuth();
  const errorCode = searchParams.get("error");

  // `failed` — похідне від URL, а не стан: сторінка змонтована рівно один раз
  // на один редирект, і дублювати `?error=` у `useState` означало б setState
  // усередині ефекту (react-hooks/set-state-in-effect). Стан тут лише один —
  // «синхронізацію клієнта завершено».
  const failed = Boolean(errorCode);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    void (async () => {
      await refreshSessionCookieCache();
      await refresh();
      if (!cancelled) setSynced(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [failed, refresh]);

  // Успіх сам відносить на головну — залишати користувача на сторінці, яка
  // більше нічого не робить, немає сенсу. Анонімного (відкрив лист в іншому
  // браузері) ведемо на вхід: на головній він побачив би гостьовий хаб і не
  // зрозумів би, чи спрацювало підтвердження.
  useEffect(() => {
    if (!synced) return;
    const target = status === "unauthenticated" ? SIGN_IN_PATH : "/";
    const timer = window.setTimeout(
      () => navigate(target, { replace: true }),
      POST_SUCCESS_REDIRECT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [synced, status, navigate]);

  // Heading-focus pattern — той самий, що у `ResetPasswordPage`: SR-юзер
  // отримує контекст сторінки до того, як дійде до кнопки.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <MeshBackground
      className="items-center px-5 overflow-y-auto"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <main
        id="main"
        tabIndex={-1}
        className="w-full max-w-sm my-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-slower outline-none"
      >
        <div className="text-center mb-6">
          <BrandLogo as="h1" size="md" className="justify-center" />
        </div>

        <Card prominence="hero" radius="xl" padding="lg" className="space-y-5">
          <div className="text-center space-y-2">
            <span
              aria-hidden="true"
              className={
                failed
                  ? "inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-danger/10 text-danger-strong dark:text-danger"
                  : "inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-strong"
              }
            >
              <Icon
                name={failed ? "alert" : "check"}
                size={22}
                strokeWidth={2.5}
              />
            </span>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-style-display text-text outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded-sm"
            >
              {failed ? "Не вийшло підтвердити" : "Email підтверджено"}
            </h2>
          </div>

          <p
            role={failed ? "alert" : "status"}
            className={
              failed
                ? "text-style-label text-text bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 leading-relaxed"
                : "text-style-label text-subtle text-center leading-relaxed"
            }
          >
            {failed
              ? (errorCode && ERROR_COPY[errorCode]) || FALLBACK_ERROR_COPY
              : synced
                ? "Готово. Зараз поверну тебе в застосунок."
                : "Оновлюю профіль…"}
          </p>

          <Button
            type="button"
            variant={failed ? "secondary" : "primary"}
            size="lg"
            className="w-full"
            onClick={() =>
              navigate(status === "unauthenticated" ? SIGN_IN_PATH : "/", {
                replace: true,
              })
            }
          >
            {status === "unauthenticated"
              ? "На сторінку входу"
              : "У застосунок"}
          </Button>
        </Card>
      </main>
    </MeshBackground>
  );
}
