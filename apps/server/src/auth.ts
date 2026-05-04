import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import type { Request } from "express";
import { env } from "./env/env.js";
import { createEncryptingAdapter } from "./auth/encryptingAdapter.js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./drizzle.js";
import { sanitizeUserImage } from "./auth/sanitizeUserImage.js";
import { queueAuthTransactionalEmail } from "./email/authTransactionalMail.js";
import { logger } from "./obs/logger.js";
import {
  authAttemptsTotal,
  authSessionLookupDurationMs,
} from "./obs/metrics.js";

/**
 * Короткий fingerprint email-у для логів. Той самий патерн (sha256 → 12 hex),
 * що й у `email/authTransactionalMail.ts`: дозволяє корелювати auth-event-и
 * у Datadog/Sentry без зливу самої адреси у логи. Локальна копія — щоб не
 * створювати cross-module coupling заради 5 рядків.
 */
function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
}

interface AdvancedCookieOptions {
  useSecureCookies: true;
  defaultCookieAttributes: {
    sameSite: "none";
    secure: true;
  };
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function getBaseURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.REPLIT_DEV_DOMAIN)
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  if (process.env.REPLIT_DOMAINS) {
    const first = process.env.REPLIT_DOMAINS.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

/**
 * Фронт (Vercel) і API (Railway) — різні сайти: кукі сесії потребують SameSite=None + Secure.
 * Увімкнено, коли base URL API — HTTPS (типово Railway), якщо не BETTER_AUTH_CROSS_SITE_COOKIES=0.
 * Локально http://localhost — без змін (Lax за замовчуванням у better-auth).
 */
function getAdvancedCookieOptions(): AdvancedCookieOptions | null {
  if (process.env.BETTER_AUTH_CROSS_SITE_COOKIES === "0") {
    return null;
  }
  const base = getBaseURL();
  if (!base.startsWith("https://")) {
    return null;
  }
  return {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  };
}

const advancedCookies = getAdvancedCookieOptions();

/**
 * Збираємо `socialProviders` тільки коли пара
 * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` обидві задані. Якщо
 * хоча б одна порожня — кидати конфіг до Better Auth не можна
 * (він зразу падає при старті, бо валідатор сприймає це як
 * misconfigured provider). Тому у dev/CI без credentials просто не
 * вмикаємо провайдера: фронтова кнопка отримає `Provider not
 * configured` через стандартний `authError` (див. `loginWithGoogle`
 * у `apps/web/src/core/auth/AuthContext.tsx`), а сервер стартує без
 * сюрпризів.
 */
function getSocialProviders():
  | { google: { clientId: string; clientSecret: string } }
  | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return {
    google: {
      clientId,
      clientSecret,
    },
  };
}

const socialProviders = getSocialProviders();

/**
 * `accessToken` / `refreshToken` / `idToken` стовпці в `account` за
 * замовчуванням `TEXT` plaintext (фікс C1). Якщо є env-ключ — заходимо
 * в Better Auth через encrypting-adapter, який шифрує токени AES-256-GCM
 * на запис і дешифрує на читання. Без ключа (dev/local) лишаємось на
 * стандартному Drizzle adapter — `assertStartupEnv` уже заборонив такий
 * старт у production. Обидва шляхи ділять один пул (`./db.js`) через
 * Drizzle instance — двох окремих pool-ів більше нема.
 */
const databaseConfig = env.BETTER_AUTH_TOKEN_ENC_KEY
  ? createEncryptingAdapter(env.BETTER_AUTH_TOKEN_ENC_KEY)
  : drizzleAdapter(db, { provider: "pg" });

export const auth = betterAuth({
  database: databaseConfig,
  baseURL: getBaseURL(),
  basePath: "/api/auth",
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  ...(socialProviders ? { socialProviders } : {}),
  emailAndPassword: {
    enabled: true,
    // NIST SP 800-63B рекомендує мінімум 8 символів; 10 — розумний trade-off,
    // що блокує атаки брут-форсом через словники без UX-пенальті для юзера.
    // maxPasswordLength захищає від DoS через надто довгі bcrypt-пейлоади.
    minPasswordLength: env.MIN_PASSWORD_LENGTH,
    maxPasswordLength: env.MAX_PASSWORD_LENGTH,
    // Не await-имо відправку — зменшує ризик timing enumeration (див. Better Auth docs).
    sendResetPassword: async ({ user, url }) => {
      queueAuthTransactionalEmail({
        kind: "password_reset",
        to: user.email,
        subject: "Скидання пароля — Sergeant",
        text: `Перейдіть за посиланням, щоб задати новий пароль (діє обмежений час):\n\n${url}\n\nЯкщо ви не запитували скидання — проігноруйте цей лист.`,
        html: `<p>Перейдіть за посиланням, щоб задати новий пароль:</p><p><a href="${escapeHtmlAttr(url)}">Скинути пароль</a></p><p>Якщо ви не запитували скидання — проігноруйте цей лист.</p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      queueAuthTransactionalEmail({
        kind: "email_verification",
        to: user.email,
        subject: "Підтвердження email — Sergeant",
        text: `Підтвердіть адресу електронної пошти:\n\n${url}\n\nЯкщо ви не реєструвались — проігноруйте цей лист.`,
        html: `<p>Підтвердіть email:</p><p><a href="${escapeHtmlAttr(url)}">Підтвердити</a></p><p>Якщо ви не реєструвались — проігноруйте цей лист.</p>`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  /**
   * `databaseHooks.user.{create,update}.before` пропускає payload через
   * `sanitizeUserImage`, який нулить `image`, якщо клієнт прислав
   * `data:` URL або рядок > 2 КБ. Чому це треба:
   *
   * Better Auth писав весь user-обʼєкт у session cookie cache (стратегія
   * `compact`, HMAC + base64). Якщо у `user.image` сидить 19 КБ-ова
   * embedded картинка (реальний інцидент 2026-05-02), один Set-Cookie
   * розчленовується на 7+ chunks, відповідь зависає на 90+ секунд через
   * проксі-ланцюг Vercel → Railway → iOS Safari, і логін падає у 504
   * («Сервер тимчасово недоступний» на UI, хоч пароль правильний).
   *
   * Логимо WARN, щоб у Sentry/Datadog видно, які клієнти ще шлють
   * data-URL — це сигнал на UI-фікс (треба робити нормальний
   * upload-pipeline у CDN, не вшивати base64 у БД). Сам реквест
   * успішний — зрізаний `image` краще, ніж 504.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const result = sanitizeUserImage(data);
          if (result.imageStripped) {
            logger.warn(
              {
                event: "auth.user.image.stripped",
                op: "create",
                reason: result.reason,
                email_hash:
                  typeof data.email === "string"
                    ? emailFingerprint(data.email)
                    : null,
              },
              "sanitizeUserImage stripped oversized/data-URL image on user.create",
            );
          }
          return { data: result.data };
        },
      },
      update: {
        before: async (data) => {
          const result = sanitizeUserImage(data);
          if (result.imageStripped) {
            logger.warn(
              {
                event: "auth.user.image.stripped",
                op: "update",
                reason: result.reason,
              },
              "sanitizeUserImage stripped oversized/data-URL image on user.update",
            );
          }
          return { data: result.data };
        },
      },
    },
  },
  trustedOrigins: getTrustedOrigins(),
  /**
   * Плагіни:
   *   - `bearer()` — дозволяє мобільним клієнтам передавати сесію через
   *     `Authorization: Bearer <token>` без cookie. Веб-браузери й далі
   *     можуть ходити з cookie — плагін тільки додає альтернативний
   *     канал, нічого не ламає.
   *   - `expo()` — коригує origin-handling для `sergeant://` / `exp://`
   *     схем і автоматично розширює `trustedOrigins` deep-link-схемами
   *     Expo API Routes.
   */
  plugins: [bearer(), expo()],
  ...(advancedCookies ? { advanced: advancedCookies } : {}),
});

/**
 * Native deep-link schemes that Better Auth treats as trusted origins for
 * mobile flows (OAuth callbacks, cross-origin sign-in).
 *
 * `sergeant://` — production scheme published by the RN app
 * (`apps/mobile/app.config.ts → scheme: "sergeant"`). Always trusted.
 *
 * `exp://` — Expo Go dev scheme. NOT bound to a single application: any
 * Expo Go app on the device can claim it, so a hostile dev-build could
 * intercept OAuth codes / session bearers. We gate it behind
 * `NODE_ENV !== "production"` (closes hardening card H5,
 * docs/security/hardening/H5-trusted-origins-exp-scheme.md).
 *
 * `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` — optional comma-separated override
 * for ops (e.g. staging that needs a custom scheme without a code change).
 * When set, it replaces the entire defaults — there is no "merge with
 * defaults" mode by design (the threat model rules out additive overrides
 * because the only realistic use case is "remove `exp://` even in dev").
 */
function getTrustedNativeSchemes(): string[] {
  const override = process.env.BETTER_AUTH_TRUSTED_NATIVE_SCHEMES;
  if (override !== undefined) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    return ["sergeant://"];
  }
  return ["sergeant://", "exp://"];
}

function getTrustedOrigins(): string[] {
  // Mobile-клієнти використовують кастомні схеми deep-link (`sergeant://`
  // у проді, `exp://` додатково у Expo dev) і локальний Metro bundler на
  // `http://localhost:8081`. Better Auth перевіряє `Origin` / `Referer`
  // проти цього списку при чутливих операціях (callback OAuth,
  // cross-origin sign-in) — без явного додавання ці ж запити летіли б
  // у 403. Список нативних схем формується у `getTrustedNativeSchemes()`
  // (див. опис вище).
  const origins: string[] = [
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:8081",
    ...getTrustedNativeSchemes(),
  ];
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    for (const d of process.env.REPLIT_DOMAINS.split(",")) {
      const trimmed = d.trim();
      if (trimmed) origins.push(`https://${trimmed}`);
    }
  }
  if (process.env.ALLOWED_ORIGINS) {
    for (const o of process.env.ALLOWED_ORIGINS.split(",")) {
      const trimmed = o.trim();
      if (trimmed) origins.push(trimmed);
    }
  }
  return origins;
}

interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
}

export async function getSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  const start = process.hrtime.bigint();
  let outcome: "miss" | "hit" | "error" = "miss";
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    const user = (session?.user ?? null) as SessionUser | null;
    if (user?.id) {
      outcome = "hit";
      // Ліниво прив'язуємо сесію до request-context і Sentry-scope. Завдяки
      // цьому будь-який log/Sentry-івент далі в ланцюжку знає, хто саме
      // виконує запит. Безпечно без сесії — просто no-op.
      try {
        const [{ setUserId }, Sentry] = await Promise.all([
          import("./obs/requestContext.js"),
          import("@sentry/node"),
        ]);
        setUserId(user.id);
        Sentry.getCurrentScope?.().setUser({ id: user.id });
      } catch {
        /* ignore — observability не має блокувати auth */
      }
    }
    return user;
  } catch (e) {
    outcome = "error";
    throw e;
  } finally {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    try {
      authSessionLookupDurationMs.observe({ outcome }, ms);
      authAttemptsTotal.inc({ op: "session_check", outcome });
    } catch {
      /* metrics must never break a request */
    }
  }
}
