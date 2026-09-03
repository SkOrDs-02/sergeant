import type { Request, RequestHandler, Response } from "express";
import { getFreshSessionUser, getSessionUser } from "../auth.js";
import { touchLastSeen } from "../lib/lastSeen.js";
import { logger } from "../obs/logger.js";
import { authSessionLookupFailureTotal } from "../obs/metrics.js";

type SessionUser = Awaited<ReturnType<typeof getSessionUser>>;
type AuthedRequest = Request & { user?: NonNullable<SessionUser> };

/**
 * H8 hardening: closes the login-state oracle on session-protected
 * endpoints. The global helmet config in `apiHelmetMiddleware` keeps
 * `Cross-Origin-Resource-Policy: cross-origin` (so the SPA on Vercel can
 * fetch the API), which means an attacker page on `evil.example` can
 * embed `<img src="https://api.../api/me">` and observe whether the
 * visitor is authenticated via `onload` / `onerror`. By overriding the
 * header to `same-origin` *for every response* served by a
 * `requireSession*` route — including 401s — we let the browser block
 * the resource regardless of body, killing both the oracle and the
 * future-framing risk described in the H8 hardening card.
 *
 * Public cross-origin endpoints (`/healthz`, `/api/metrics/web-vitals`,
 * `/api/csp-report`, OAuth callbacks under `/api/auth/*`) do not pass
 * through `requireSession*`, so they keep the helmet default. See
 * `docs/security/hardening/H8-corp-per-route.md`.
 */
function setSameOriginCorp(res: Response): void {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

/**
 * M13 — circuit-breaker for `requireSessionSoft()`. Persistent
 * `getSessionUser` exceptions (Postgres unavailable, Better Auth import
 * failure, etc.) historically masked as 401 → push service-workers
 * retried forever, log floods masked the real outage. Once the
 * `consecutiveSoftFailures` counter crosses the threshold, the soft
 * variant escalates to a loud `503` so dashboards (`auth_session_lookup_failure_total{mode="loud_503"}`)
 * and clients (push subscribe-with-backoff) react.
 *
 * Counter is in-process: each replica trips independently, which is
 * intentional (Railway runs ≥2 replicas, so a single-replica blip on a
 * cold pool is absorbed without alarming everyone). Successful lookup
 * resets the counter on the same replica.
 *
 * See `docs/security/hardening/M13-require-session-soft-loud-fail.md`.
 */
const SOFT_FAILURE_LOUD_THRESHOLD = 5;
let consecutiveSoftFailures = 0;

export const __testingResetSoftFailureCounter = (): void => {
  consecutiveSoftFailures = 0;
};

/**
 * Router-level auth-middleware. Резолвить Better Auth сесію, кладе юзера в
 * `req.user` і кличе `next()`. Якщо сесії немає — 401; якщо lookup впав
 * (наприклад, тимчасовий недоступ БД) — передаємо помилку далі у error-
 * handler (500), бо для звичайних endpoint-ів фронту важливо відрізняти
 * "ти не залогінений" від "у нас щас все горить".
 *
 * Для endpoint-ів, де фронт історично трактує будь-яку невдачу auth як
 * "не залогінений" (push subscribe/unsubscribe — сервіс-воркер не має
 * падати у 500 при тимчасовому збої), використовуй `requireSessionSoft()`.
 *
 * Цей middleware також override-ить `Cross-Origin-Resource-Policy` на
 * `same-origin` перед резолвом сесії — закриває login-state oracle і
 * embedding-атаки з cross-origin (закриває hardening-карту H8,
 * `docs/security/hardening/H8-corp-per-route.md`).
 */
export function requireSession(): RequestHandler {
  return buildRequireSession((req) => getSessionUser(req), "require");
}

/**
 * Як `requireSession()`, але сесія резолвиться через `getFreshSessionUser`
 * — в обхід 5-хвилинного `session.cookieCache`, одним SELECT-ом на запит.
 * Відкликана (logout з іншого пристрою, revoke після зміни пароля) або
 * вкрадена сесія перестає проходити **негайно**, а не після кеш-вікна.
 *
 * Ціна — DB-lookup на кожен виклик, тому це не заміна `requireSession()`,
 * а гейт для поверхонь, де вартість 5-хвилинного вікна вища за latency:
 * повний експорт даних, видалення акаунта, підʼєднання/відʼєднання банку
 * (аудит `docs/90-work/audits/2026-08-05-orphaned-code-audit.md` § 7а).
 *
 * Семантика відповідей тотожна `requireSession()`: без валідної сесії у
 * БД — `401 UNAUTHORIZED` (навіть якщо cookie-кеш ще «живий»); lookup
 * впав — `next(err)` → 500. CORP=same-origin ставиться так само (H8).
 */
export function requireFreshSession(): RequestHandler {
  return buildRequireSession(
    (req) => getFreshSessionUser(req),
    "require_fresh",
  );
}

/**
 * Резолвер передається як стрілка, а не як сам імпорт (`getSessionUser`):
 * так binding з `../auth.js` читається лише на запиті, а не в момент
 * побудови роутера. Це важливо для тестів, які мокають `../auth.js`
 * частково (`vi.mock` без `getFreshSessionUser`) і викликають `createApp()`,
 * не торкаючись fresh-роутів — інакше сам `createApp()` падав би на
 * «No export is defined on the mock».
 */
function buildRequireSession(
  resolve: (req: Request) => Promise<SessionUser>,
  variant: "require" | "require_fresh",
): RequestHandler {
  return async (req, res, next) => {
    setSameOriginCorp(res);
    try {
      const user = await resolve(req);
      if (!user) {
        res.status(401).json({
          error: "Потрібна автентифікація",
          message: "Потрібна автентифікація",
          code: "UNAUTHORIZED",
        });
        return;
      }
      (req as AuthedRequest).user = user;
      // Throttled fire-and-forget — див. `lib/lastSeen.ts`. Стоїть тут, а не
      // в кожному хендлері, бо «візит» = будь-який автентифікований запит.
      touchLastSeen(user.id);
      next();
    } catch (err) {
      // M13 — distinguish "no session" (which is `user === null` above and
      // already returned 401) from "session lookup blew up". The latter
      // propagates to the error-handler as a 500, but we count it here
      // so dashboards see the same signal regardless of variant.
      authSessionLookupFailureTotal.labels(variant, "loud_503").inc();
      logger.warn({
        msg: "auth_session_lookup_failed",
        variant,
        err: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  };
}

/**
 * Як `requireSession()`, але lookup-failure не падає у 500-error-handler.
 * Замість цього перші `SOFT_FAILURE_LOUD_THRESHOLD - 1` поспіль помилок
 * мапляться у 401 (зберігає історичну поведінку push-сервіс-воркера на
 * cold-pool blip), а починаючи з N-ї поспіль — у 503, щоб dashboards
 * побачили реальний outage.
 *
 * Так само override-ить CORP на `same-origin` (див. коментар у
 * `requireSession`).
 */
export function requireSessionSoft(): RequestHandler {
  return async (req, res, next) => {
    setSameOriginCorp(res);
    let user: SessionUser = null;
    let lookupError: unknown = undefined;
    try {
      user = await getSessionUser(req);
    } catch (err) {
      lookupError = err;
    }

    if (user) {
      consecutiveSoftFailures = 0;
      (req as AuthedRequest).user = user;
      touchLastSeen(user.id);
      next();
      return;
    }

    if (lookupError === undefined) {
      // True "no session" — preserve original 401 behaviour and do
      // not touch the failure counter.
      res.status(401).json({
        error: "Потрібна автентифікація",
        message: "Потрібна автентифікація",
        code: "UNAUTHORIZED",
      });
      return;
    }

    // Lookup actually failed — count, log, and escalate to 503 once the
    // circuit-breaker trips.
    consecutiveSoftFailures += 1;
    const escalate = consecutiveSoftFailures >= SOFT_FAILURE_LOUD_THRESHOLD;
    authSessionLookupFailureTotal
      .labels("require_soft", escalate ? "loud_503" : "soft_swallowed")
      .inc();
    logger.warn({
      msg: "auth_session_lookup_failed",
      variant: "require_soft",
      consecutive: consecutiveSoftFailures,
      escalated: escalate,
      err:
        lookupError instanceof Error
          ? lookupError.message
          : String(lookupError),
    });

    if (escalate) {
      res.status(503).json({
        error: "Сервіс автентифікації тимчасово недоступний",
        code: "SESSION_LOOKUP_UNAVAILABLE",
      });
      return;
    }

    res.status(401).json({
      error: "Потрібна автентифікація",
      message: "Потрібна автентифікація",
      code: "UNAUTHORIZED",
    });
  };
}
