import type { NextFunction, Request, Response } from "express";
import { createHash } from "crypto";
import { rateLimitExpress } from "./rateLimit.js";
import { policyOptions } from "../config/rateLimit.js";
import { env } from "../env.js";
import { logger } from "../obs/logger.js";
import { authAttemptsTotal } from "../obs/metrics.js";

/**
 * Жорсткіший ліміт на sign-in / sign-up / reset (POST).
 *
 * Fail-closed (controlled by `RATE_LIMIT_FAIL_CLOSED_AUTH`, default `true`):
 * якщо і Redis, і Postgres недоступні, middleware повертає 503 замість
 * того, щоб пускати запит через per-process in-memory bucket. На
 * multi-replica deploy in-memory bucket = `N×limit` ефективно, що
 * прискорює credential-stuffing у `N×`. Fail-closed зупиняє цю
 * амплифікацію — атакер не може накручувати спроби, поки backend не
 * відновиться.
 */
export function authSensitiveRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const url = req.originalUrl || "";
  const sensitive =
    req.method === "POST" &&
    (url.includes("/sign-in") ||
      url.includes("/sign-up") ||
      url.includes("forget-password") ||
      url.includes("request-password-reset") ||
      url.includes("reset-password"));
  if (!sensitive) {
    next();
    return;
  }
  rateLimitExpress(
    policyOptions("api:auth:sensitive", {
      // Env var — runtime kill-switch (set `RATE_LIMIT_FAIL_CLOSED_AUTH=false`
      // щоб revert у open-mode без redeploy-у). Реєстр тримає `failMode:
      // "closed"` як safe default; override-ить тільки якщо явно вимкнено.
      failMode: env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open",
    }),
  )(req, res, next);
}

/**
 * Лишаємо тільки перші 12 hex-символів SHA-256(lower(email)) — достатньо
 * щоб корелювати спроби за одним юзером (brute-force / credential-stuffing)
 * і **не є PII**: не reversible без offline brute-force по словнику.
 * У Prometheus цей лейбл НЕ йде (cardinality), тільки у Pino-лог.
 */
function emailFingerprint(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return createHash("sha256")
    .update(raw.toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

/**
 * Класифікує auth-ендпоінти better-auth і після відповіді інкрементує
 * `authAttemptsTotal{op,outcome}` + пише structured `auth_event` лог
 * з `emailHash` / `ip` для brute-force тріажу. Ставити ПЕРЕД
 * `authSensitiveRateLimit` (і ДО `toNodeHandler(auth)`): `res.on("finish")`
 * спрацьовує, навіть коли rate-limiter короткозамикає пайплайн без
 * `next()`, тому реєстрація listener-а мусить відбутись раніше за сам
 * limiter, щоб 429 ловились.
 */
type AuthOp =
  | "sign_in"
  | "sign_up"
  | "forget_password"
  | "reset_password"
  | "signout";

export function authMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST") {
    next();
    return;
  }
  const url = req.originalUrl || "";
  const op: AuthOp | null =
    (url.includes("/sign-in") && "sign_in") ||
    (url.includes("/sign-up") && "sign_up") ||
    // Better Auth v1.6 renamed `/forget-password` to
    // `/request-password-reset`; keep both spellings so the audit-log /
    // `authAttemptsTotal{op="forget_password"}` counter survives the
    // rename and stays compatible with older clients.
    (url.includes("forget-password") && "forget_password") ||
    (url.includes("request-password-reset") && "forget_password") ||
    (url.includes("reset-password") && "reset_password") ||
    (url.includes("/sign-out") && "signout") ||
    null;
  if (!op) {
    next();
    return;
  }

  // Читаємо body ДО `res.on("finish")`: better-auth toNodeHandler може
  // консьюмити stream і замінити/зачистити `req.body` до моменту емісії.
  // express.json() у app.js парсить auth-роути глобальним дефолтом (128kb),
  // тож на /sign-in `req.body` — це завжди object або undefined.
  const body = (req.body ?? {}) as { email?: unknown };
  const emailHash =
    op === "sign_in" || op === "sign_up" || op === "forget_password"
      ? emailFingerprint(body.email)
      : undefined;

  res.on("finish", () => {
    const s = res.statusCode;
    const outcome =
      s === 429
        ? "rate_limited"
        : s === 401 || s === 403
          ? "bad_credentials"
          : s >= 500
            ? "error"
            : s >= 400
              ? "invalid"
              : "ok";
    try {
      authAttemptsTotal.inc({ op, outcome });
    } catch {
      /* ignore */
    }
    // Structured log у ДОПОВНЕННЯ до HTTP-лога: той не має `op` і
    // `emailHash`, через які робимо brute-force тріаж.
    //   {service="sergeant-api"} | json | msg="auth_event" | outcome="bad_credentials" | emailHash="abc123..."
    try {
      const level =
        outcome === "error"
          ? "error"
          : outcome === "bad_credentials" ||
              outcome === "rate_limited" ||
              outcome === "invalid"
            ? "warn"
            : "info";
      logger[level]({
        msg: "auth_event",
        op,
        outcome,
        status: s,
        emailHash,
        ip: req.ip,
        ua: req.get("user-agent") || undefined,
      });
    } catch {
      /* logging must never break a response */
    }
  });
  next();
}
