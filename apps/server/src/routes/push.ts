import { Router } from "express";
import { env } from "../env/env.js";
import {
  rateLimitExpress,
  requireApiSecret,
  requireSession,
  setModule,
} from "../http/index.js";
import { requireInternalIp } from "../http/requireInternalIp.js";
import { logger } from "../obs/logger.js";
import {
  pushTest,
  register as pushRegister,
  sendPush,
  unregister as pushUnregister,
  vapidPublic,
} from "../modules/push/push.js";

/**
 * `/api/push/vapid-public` свідомо поза rate-limiter-ом: його смикає фронт
 * під час реєстрації сервіс-воркера і він має бути швидким/дешевим.
 *
 * Решта захищених endpoint-ів (register/unregister/test) мають
 * трирівневий гейт, і порядок навмисний:
 *   1. Pre-auth IP-лімітер (`api:push:ip`, 150/хв, окремий `preAuthIpRateLimit`)
 *      — ПЕРЕД `requireSession()`. Сесія на невдачі шле 401 і НЕ кличе
 *      `next()`, тож без цього гейта безсесійний флуд (відсутня/підроблена
 *      кука) взагалі не діставався б до per-user бакета нижче — а
 *      `getSessionUser` усе одно робить lookup у session-store на кожен
 *      такий запит. Окремий `key` (суфікс `:ip`), ліміт 150/хв = 5×
 *      per-user 30/хв.
 *   2. `requireSession()` — резолвить сесію.
 *   3. Спільний per-user бакет `api:push` (30/хв, `broadRateLimit`),
 *      застосований ПІСЛЯ сесії навмисно (рецидив знахідки B31, PR-A3 у
 *      `docs/work/specs/audits/2026-09-13-product-full-review.md`):
 *      `rateLimitSubject` (`http/rateLimit.ts`) читає `req.user.id` і
 *      фолбечиться на `ip:<addr>` лише коли сесії немає. Раніше цей бакет
 *      висів через `r.use("/api/push", …)` ПЕРЕД усіма post/delete-роутами,
 *      тож `req.user` завжди був unset у момент перевірки і бакет завжди
 *      фолбечився на IP.
 *
 * `send` — єдиний виняток: internal-only endpoint без сесії взагалі
 * (захист — мережевий allowlist + `X-Api-Secret`), тож його `broadRateLimit`
 * і так рахується per-IP і окремого pre-auth гейта не потребує.
 * `test` виняток НЕ становить: те, що `requireSession()` стоїть там першим,
 * — це і є та сама діра, а не її відсутність, тож pre-auth гейт у нього
 * такий самий, як у решти.
 */
export function createPushRouter(): Router {
  const r = Router();
  r.use("/api/push", setModule("push"));
  r.get("/api/push/vapid-public", vapidPublic);
  const broadRateLimit = rateLimitExpress({
    key: "api:push",
    limit: 30,
    windowMs: 60_000,
  });
  // Pre-auth IP-бакет — окремий `key` (суфікс `:ip`), інакше ділив би
  // лічильник із per-user `api:push` вище. 150/хв = 5× per-user ліміт.
  const preAuthIpRateLimit = rateLimitExpress({
    key: "api:push:ip",
    limit: 150,
    windowMs: 60_000,
  });
  // `/api/push/register` — уніфікований mobile+web endpoint. Свідомо йде
  // через `requireSession()` (жорсткий 401), а не `requireSessionSoft`:
  // mobile-клієнт має прозорий сигнал "токен протух, треба перелогінитись",
  // а не silently 200 з пустою сесією. Доступний також як `/api/v1/push/register`
  // через `apiVersionRewrite`.
  r.post(
    "/api/push/register",
    preAuthIpRateLimit,
    requireSession(),
    broadRateLimit,
    pushRegister,
  );
  // `/api/push/unregister` — симетричний анрег. Web шле
  // `{ platform: "web", endpoint }`, native — `{ platform, token }`.
  // Сесія обовʼязкова з тих самих причин, що й у register.
  r.post(
    "/api/push/unregister",
    preAuthIpRateLimit,
    requireSession(),
    broadRateLimit,
    pushUnregister,
  );
  // `/api/push/send` — internal-only fan-out endpoint. Hardening item M14
  // (`docs/security/hardening/M14-internal-push-ip-allowlist.md`) layers
  // three independent checks here:
  //   1. `requireInternalIp(...)` — network-level allowlist. The
  //      operator-supplied list lives in `PUSH_INTERNAL_ALLOWED_IPS`
  //      (comma-or-newline-separated CIDRs / IPs). On Railway this is
  //      typically `100.64.0.0/10` (the proxy-internal CGN range that
  //      every internal client sees) plus any explicit IPv4/IPv6 of
  //      n8n-style external workers. Loopback is included implicitly so
  //      on-host calls (supertest, `curl localhost`) keep working in
  //      dev/test without operator action. An empty allowlist
  //      fails-open in non-production and fails-closed (503) in
  //      production — symmetric to how `requireApiSecret` 503s on a
  //      missing env var.
  //   2. `requireApiSecret("API_SECRET")` — application-level shared
  //      secret with constant-time compare.
  //   3. Per-target-user rate-limit + audit log inside the `sendPush`
  //      handler itself.
  // No session on this route (internal secret-based auth), so the broad
  // "api:push" bucket stays IP-keyed here — that's intentional, not the
  // B31/PR-A3 bug the routes above were fixed for.
  r.post(
    "/api/push/send",
    broadRateLimit,
    requireInternalIp({
      // P2-1: читаємо з zod-валідованого env (default "" →
      // legacy `?? ""` semantic). Парсинг формату (CIDR, IP, comma/ньюлайн)
      // всередині `requireInternalIp` — невалідний entry не 500-ить
      // route, fall-through на loopback-defaults.
      entries: env.PUSH_INTERNAL_ALLOWED_IPS,
      onReject: ({ ip, path }) => {
        logger.warn({
          msg: "push_send_ip_rejected",
          callerIp: ip,
          path,
        });
      },
    }),
    requireApiSecret("API_SECRET"),
    sendPush,
  );
  // `/api/v1/push/test` — ручка «пульнути тестовий пуш на мої пристрої».
  // Реєструємо на `/api/push/test`: `apiVersionRewrite` у `app.ts` переписує
  // `/api/v1/*` → `/api/*` до роутингу, тож цей handler обслуговує обидва URL.
  // Свій, вужчий rate-limit (1 req / 5 s / user) поверх загального push-бакета:
  // `rateLimitSubject` після `requireSession` дасть `u:<userId>`, тож ліміт
  // per-user, а не per-IP (мобільний LTE/CGN не має «скинути» стан).
  // `rateLimitExpress` використовує Redis коли REDIS_URL встановлений,
  // інакше — in-memory fallback per-process.
  r.post(
    "/api/push/test",
    preAuthIpRateLimit,
    requireSession(),
    broadRateLimit,
    rateLimitExpress({ key: "api:push:test", limit: 1, windowMs: 5_000 }),
    pushTest,
  );
  return r;
}
