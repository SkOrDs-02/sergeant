import { betterAuth } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import type { Request } from "express";
import pool from "./db.js";
import { env } from "./env/env.js";
import { createEncryptingAdapter } from "./auth/encryptingAdapter.js";
import { queueAuthTransactionalEmail } from "./email/authTransactionalMail.js";
import {
  authAttemptsTotal,
  authSessionLookupDurationMs,
} from "./obs/metrics.js";

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
 * стандартному `database: pool` — `assertStartupEnv` уже заборонив
 * такий старт у production.
 */
const databaseConfig = env.BETTER_AUTH_TOKEN_ENC_KEY
  ? createEncryptingAdapter(pool, env.BETTER_AUTH_TOKEN_ENC_KEY)
  : pool;

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
    minPasswordLength: Number(process.env.MIN_PASSWORD_LENGTH) || 10,
    maxPasswordLength: Number(process.env.MAX_PASSWORD_LENGTH) || 128,
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

function getTrustedOrigins(): string[] {
  // Mobile-клієнти використовують кастомні схеми deep-link (`sergeant://`,
  // `exp://` у Expo dev) і локальний Metro bundler на `http://localhost:8081`.
  // Better Auth перевіряє `Origin` / `Referer` проти цього списку при
  // чутливих операціях (callback OAuth, cross-origin sign-in) — без явного
  // додавання ці ж запити летіли б у 403.
  const origins: string[] = [
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:8081",
    "sergeant://",
    "exp://",
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
  [key: string]: unknown;
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
