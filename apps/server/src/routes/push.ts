import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireApiSecret,
  requireSession,
  requireSessionSoft,
  setModule,
} from "../http/index.js";
import { requireInternalIp } from "../http/requireInternalIp.js";
import { logger } from "../obs/logger.js";
import {
  pushTest,
  register as pushRegister,
  sendPush,
  subscribe as pushSubscribe,
  unregister as pushUnregister,
  unsubscribe as pushUnsubscribe,
  vapidPublic,
} from "../modules/push/push.js";

/**
 * `/api/push/vapid-public` свідомо поза rate-limiter-ом: його смикає фронт
 * під час реєстрації сервіс-воркера і він має бути швидким/дешевим. Решта
 * endpoint-ів (subscribe/unsubscribe/send) лімітуються.
 *
 * subscribe/unsubscribe використовують `requireSessionSoft`, а не
 * `requireSession`: service worker смикає ці endpoint-и у фоні, і
 * історично handler трактував будь-яку невдачу `getSessionUser` як 401
 * (а не 500), щоб тимчасовий збій БД не перетворювався на notification
 * "server error" на фронті. `send` — внутрішній API cron/worker-ів,
 * захищений `X-Api-Secret`.
 */
export function createPushRouter(): Router {
  const r = Router();
  r.use("/api/push", setModule("push"));
  r.get("/api/push/vapid-public", asyncHandler(vapidPublic));
  r.use(
    "/api/push",
    rateLimitExpress({ key: "api:push", limit: 30, windowMs: 60_000 }),
  );
  r.post(
    "/api/push/subscribe",
    requireSessionSoft(),
    asyncHandler(pushSubscribe),
  );
  r.delete(
    "/api/push/subscribe",
    requireSessionSoft(),
    asyncHandler(pushUnsubscribe),
  );
  // `/api/push/register` — уніфікований mobile+web endpoint. Свідомо йде
  // через `requireSession()` (жорсткий 401), а не `requireSessionSoft`:
  // mobile-клієнт має прозорий сигнал "токен протух, треба перелогінитись",
  // а не silently 200 з пустою сесією. Доступний також як `/api/v1/push/register`
  // через `apiVersionRewrite`.
  r.post("/api/push/register", requireSession(), asyncHandler(pushRegister));
  // `/api/push/unregister` — симетричний анрег. Web шле
  // `{ platform: "web", endpoint }`, native — `{ platform, token }`.
  // Сесія обов'язкова з тих самих причин, що й у register.
  r.post(
    "/api/push/unregister",
    requireSession(),
    asyncHandler(pushUnregister),
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
  r.post(
    "/api/push/send",
    requireInternalIp({
      entries: process.env.PUSH_INTERNAL_ALLOWED_IPS ?? "",
      onReject: ({ ip, path }) => {
        logger.warn({
          msg: "push_send_ip_rejected",
          callerIp: ip,
          path,
        });
      },
    }),
    requireApiSecret("API_SECRET"),
    asyncHandler(sendPush),
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
    requireSession(),
    rateLimitExpress({ key: "api:push:test", limit: 1, windowMs: 5_000 }),
    asyncHandler(pushTest),
  );
  return r;
}
