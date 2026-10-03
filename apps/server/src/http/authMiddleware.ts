import type { NextFunction, Request, Response } from "express";
import { createHash } from "crypto";
import { rateLimitExpress } from "./rateLimit.js";
import {
  AUTH_ACCOUNT_RATE_LIMIT,
  AUTH_SENSITIVE_RATE_LIMIT,
} from "../config/rateLimit.js";
import { env } from "../env.js";
import { AppError, ValidationError } from "../obs/errors.js";
import { logger } from "../obs/logger.js";
import { authAttemptsTotal } from "../obs/metrics.js";
import { ipPrefix } from "../auth/sessionFingerprint.js";
import { normaliseUserAgent } from "../lib/uaNormalise.js";

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
  rateLimitExpress({
    ...AUTH_SENSITIVE_RATE_LIMIT,
    // Env var — runtime kill-switch (set `RATE_LIMIT_FAIL_CLOSED_AUTH=false`
    // щоб revert у open-mode без redeploy-у). `AUTH_SENSITIVE_RATE_LIMIT`
    // тримає `failMode: "closed"` як safe default; override-ить тільки
    // якщо явно вимкнено.
    failMode: env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open",
  })(req, res, next);
}

/**
 * Типи тіла, які `bodySizePolicy` для `/api/auth` гарантовано парсить у
 * `req.body` (`express.json` + `express.urlencoded`). Усе інше на
 * credential-роутах `authAccountRateLimit` відсікає 415.
 */
const PARSED_AUTH_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/x-www-form-urlencoded",
]);

function baseType(req: Request): string {
  const raw = req.headers["content-type"] ?? "";
  return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

/** Той самий критерій, що в `type-is`/body-parser: є тіло чи ні. */
function hasRequestBody(req: Request): boolean {
  if (req.headers["transfer-encoding"] !== undefined) return true;
  const len = Number(req.headers["content-length"]);
  return Number.isFinite(len) && len > 0;
}

/**
 * Другий, per-account бакет поверх `authSensitiveRateLimit` (F2).
 *
 * `authSensitiveRateLimit` ключується на IP (сесії до автентифікації ще
 * немає), тому розподілена атака масштабується лінійно з кількістю
 * орендованих адрес: 100 IP = 100× спроб по одному акаунту, і кожен
 * окремий бакет при цьому зелений. Цей middleware ключує бакет на
 * **цільовому email-і**, тож стеля перестає залежати від мережі атакера.
 *
 * Свідомі обмеження:
 *   - Тільки sign-in і password-reset. Sign-up сюди НЕ входить: там email
 *     ще нікому не належить, і бакет по ньому не захищає акаунт, зате дає
 *     стороннім спосіб зайняти адресу.
 *   - Немає email у тілі (напр. `reset-password` з токеном) — пропускаємо:
 *     ключувати нічим, а мовчазний відкат на IP злив би два різні ліміти
 *     в один бакет.
 *   - Вікно, а не постійний lockout — інакше будь-хто замикав би чужий
 *     акаунт кількома невдалими спробами.
 *   - Fail-closed (sec-11): тіло з типом, окремим від JSON/urlencoded, — 415;
 *     `email`, що не є одним рядком (повтор ключа у формі), — 400. Інакше
 *     handler Better Auth бачить інший email, ніж бакет.
 */
export function authAccountRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Шлях без query: `?next=/sign-in` на іншому маршруті не робить його
  // «targeted», а handler Better Auth маршрутизує саме по шляху.
  const path = (req.originalUrl || "").split("?")[0] ?? "";
  const targeted =
    req.method === "POST" &&
    (path.includes("/sign-in") ||
      path.includes("forget-password") ||
      path.includes("request-password-reset") ||
      path.includes("reset-password"));
  if (!targeted) {
    next();
    return;
  }

  // Fail-closed по Content-Type (sec-11). Better Auth матчить тип за
  // `includes("application/json")` і парсить JSON за регексом без якоря
  // кінця, тож `application/jsonx` / `application/json-patch+json` він
  // приймає, а наші `express.json` / `express.urlencoded` — ні: `req.body`
  // лишається `undefined`, email не видно, бакет пропущено. Замість того
  // щоб доганяти кожен варіант парсером, пускаємо в credential-флоу лише
  // два типи, які ми гарантовано розбираємо (точний збіг бази типу).
  if (hasRequestBody(req) && !PARSED_AUTH_CONTENT_TYPES.has(baseType(req))) {
    next(
      new AppError(
        "Content-Type має бути application/json або application/x-www-form-urlencoded",
        { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
      ),
    );
    return;
  }

  // Fail-closed по формі поля. Повторений ключ у form-тілі
  // (`email=junk&email=victim`) body-parser віддає масивом, а Better Auth
  // (better-call `getBody`) лишає ОСТАННЄ значення: бакет за рядковою
  // перевіркою пропускав запит, пароль перевірявся для victim. Будь-що, крім
  // рядка, відхиляємо, а не вгадуємо, яке значення вибере handler.
  const body = (req.body ?? {}) as { email?: unknown };
  if (body.email !== undefined && typeof body.email !== "string") {
    next(new ValidationError("Поле email має бути одним рядком"));
    return;
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    next();
    return;
  }

  rateLimitExpress({
    ...AUTH_ACCOUNT_RATE_LIMIT,
    failMode: env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open",
    // Повний SHA-256, не 12-символьний лог-фінгерпринт: той призначений
    // для кореляції в логах, де колізія лише зашумить тріаж, а тут вона
    // склеїла б ліміти двох різних акаунтів.
    subject: () =>
      `a:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`,
  })(req, res, next);
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
 * з `emailHash` / мережевим походженням для brute-force тріажу.
 *
 * Скільки саме походження логувати — вирішує РЕЗУЛЬТАТ, див.
 * `networkOriginFor()` нижче. Ставити ПЕРЕД
 * `authSensitiveRateLimit` (і ДО `toNodeHandler(auth)`): `res.on("finish")`
 * спрацьовує, навіть коли rate-limiter короткозамикає пайплайн без
 * `next()`, тому реєстрація listener-а мусить відбутись раніше за сам
 * limiter, щоб 429 ловились.
 */
type AuthOp =
  "sign_in" | "sign_up" | "forget_password" | "reset_password" | "signout";

type AuthOutcome =
  "ok" | "bad_credentials" | "rate_limited" | "invalid" | "error";

/**
 * Скільки мережевого походження класти в `auth_event` — залежно від
 * результату спроби.
 *
 * Політика репо (`docs/governance/security/pii-handling.md`, Class C)
 * класифікує IP як identifier за GDPR Art. 4(1) і формулює компроміс так:
 * «логуємо для security events; уникаємо у звичайних info». Успішний вхід —
 * це НЕ security event: він іде рівнем `info`, трапляється щодня в кожного
 * користувача і разом із `emailHash` у тому ж рядку дає готовий журнал
 * «хто звідки заходив» із багатоденним ретеншном. Саме такий журнал ми і
 * не збираємось вести.
 *
 * Невдала спроба — навпаки, рівно той випадок, заради якого виняток і
 * зроблено: щоб заблокувати джерело credential-stuffing-у, потрібна ТОЧНА
 * адреса, а не мережа, — по /24 бан зачепить сусідів по провайдеру.
 *
 * Тому:
 *   - `bad_credentials` / `rate_limited` / `invalid` — повний `ip` (плюс
 *     `ipPrefix`, щоб запити по мережі працювали однаково на обох гілках);
 *   - `ok` / `error` — лише `/24` (IPv6 — `/64`) через наявний `ipPrefix()`
 *     із `auth/sessionFingerprint.ts`. Для brute-force-тріажу мережі
 *     достатньо: розподілена атака все одно міняє хости всередині /24.
 *
 * UA завжди йде через `normaliseUserAgent()` — сирий `User-Agent` давав
 * >300 унікальних значень на добу і де-факто реідентифікував окремих людей
 * (та сама знахідка M12, що й для `/api/metrics/web-vitals`); канонічна
 * форма («chrome 121») лишає сигнал про клієнта без квазі-ідентифікатора.
 */
function networkOriginFor(
  outcome: AuthOutcome,
  req: Request,
): {
  ip?: string | undefined;
  ipPrefix?: string | undefined;
  ua_family: string;
} {
  const prefix = ipPrefix(req.ip) ?? undefined;
  const ua_family = normaliseUserAgent(req.get("user-agent"));
  const isSecurityEvent =
    outcome === "bad_credentials" ||
    outcome === "rate_limited" ||
    outcome === "invalid";

  if (isSecurityEvent) {
    return { ip: req.ip, ipPrefix: prefix, ua_family };
  }
  return { ipPrefix: prefix, ua_family };
}

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
        ...networkOriginFor(outcome, req),
      });
    } catch {
      /* logging must never break a response */
    }
  });
  next();
}
