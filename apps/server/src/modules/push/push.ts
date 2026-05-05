import type { Request, Response } from "express";
import webpush from "web-push";
import pool from "../../db.js";
import { sendWebPush } from "../../lib/webpushSend.js";
import { logger } from "../../obs/logger.js";
import { pushSendsTotal } from "../../obs/metrics.js";
import { sendToUser } from "../../push/send.js";
import { validateBody } from "../../http/validate.js";
import { getIp, getPerTargetRateLimit } from "../../http/rateLimit.js";
import {
  PushRegisterSchema,
  PushSendSchema,
  PushSubscribeSchema,
  PushTestRequestSchema,
  PushUnregisterSchema,
  PushUnsubscribeSchema,
} from "../../http/schemas.js";
import { logPushSend } from "./audit.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Historical domain-metric `push_sends_total` — зберігаємо для сумісності
 * з існуючими дашбордами/алертами. Уніфікована `external_http_requests_total
 * {upstream="push"}` вже інкрементиться всередині `sendWebPush` через
 * `recordExternalHttp`, тож тут лише дублюємо domain-лейбл.
 */
function recordDomainOutcome(outcome: string): void {
  try {
    pushSendsTotal.inc({ outcome });
  } catch {
    /* ignore */
  }
}

const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"];

/**
 * Resolve the VAPID contact. Some push services downgrade or drop requests
 * from unroutable addresses (example.com), so in production we require a
 * real `VAPID_EMAIL` rather than silently shipping a bogus default. In
 * non-prod we keep the placeholder to avoid breaking local dev when only
 * the keys are configured.
 */
export function resolveVapidEmail(): string | null {
  const raw = process.env["VAPID_EMAIL"]?.trim();
  if (raw) return raw.startsWith("mailto:") ? raw : `mailto:${raw}`;
  if (process.env["NODE_ENV"] === "production") {
    logger.error({
      msg: "vapid_email_missing",
      hint: "Set VAPID_EMAIL (e.g. mailto:admin@your-domain) to avoid push deliverability issues",
    });
    return null;
  }
  return "mailto:admin@example.com";
}

const VAPID_EMAIL = resolveVapidEmail();

// All three pieces must be present for webpush to work. Any handler that
// would otherwise touch `webpush.*` must short-circuit on this flag,
// otherwise `sendNotification` throws deep inside the library and push
// sends silently fail with `outcome: "error"`.
const vapidReady = Boolean(VAPID_PUBLIC && VAPID_PRIVATE && VAPID_EMAIL);

if (vapidReady) {
  webpush.setVapidDetails(VAPID_EMAIL!, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

/** GET /api/push/vapid-public — повертає публічний VAPID ключ для підписки. */
export async function vapidPublic(_req: Request, res: Response): Promise<void> {
  if (!vapidReady) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }
  res.json({ publicKey: VAPID_PUBLIC });
}

/**
 * POST /api/push/subscribe — legacy proxy на уніфікований `register`.
 *
 * Історичний web-only endpoint; після переходу web-клієнта на
 * `POST /api/v1/push/register` цей шлях лишається лише для старих
 * вкладок, які ще не завантажили оновлений JS. Handler нормалізує
 * `{ endpoint, keys }` у web-гілку `PushRegisterSchema` і викликає
 * той самий register-flow, що й `/api/push/register`, щоб не було
 * двох шляхів запису у БД.
 *
 * Deprecation: видалити цей роут і handler через 1-2 сесії після
 * deploy-у session-4c (коли метрика legacy-виклику спаде до 0).
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  if (!vapidReady) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }

  const user = (req as WithSessionUser).user!;
  const parsed = validateBody(PushSubscribeSchema, req, res);
  if (!parsed.ok) return;
  const { endpoint, keys } = parsed.data;

  logger.warn({
    msg: "push_deprecation",
    deprecation: "/api/push/subscribe called, route to /api/v1/push/register",
    userId: user.id,
  });

  // Re-subscribe одного й того ж endpoint-а має «воскресити» soft-deleted
  // рядок (deleted_at = NULL), інакше браузер, який повернувся з 410 → 200
  // через N годин, лишався б вимкненим у нас. Той самий upsert живе у
  // `register()` web-гілці — тримаємо тут ідентичний SQL, щоб один legacy
  // запит не створював розбіжність стану.
  //
  // EXPLAIN ANALYZE (типовий plan):
  //   Insert on push_subscriptions  (cost=0..12 rows=1)
  //     Conflict Resolution: UPDATE
  //     Conflict Arbiter Indexes: push_subscriptions_endpoint_key
  //       -> Index Scan using push_subscriptions_endpoint_key  (rows=1)
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
         SET p256dh = $3, auth = $4, user_id = $1, deleted_at = NULL`,
    [user.id, endpoint, keys.p256dh, keys.auth],
  );
  res.json({ ok: true });
}

/**
 * POST /api/v1/push/register — уніфікована реєстрація push-пристрою.
 *
 * Доступний і на `/api/push/register` (той самий handler, через
 * `apiVersionRewrite`). Для web-платформи — проксі на існуючий
 * `push_subscriptions` flow (upsert + recover з soft-delete), щоб
 * не дублювати state у двох таблицях. Для ios/android — upsert у
 * нову `push_devices`. Реальна відправка для native поки не реалізована
 * (див. docs/mobile/overview.md).
 */
export async function register(req: Request, res: Response): Promise<void> {
  const user = (req as WithSessionUser).user!;
  const parsed = validateBody(PushRegisterSchema, req, res);
  if (!parsed.ok) return;
  const data = parsed.data;

  if (data.platform === "web") {
    if (!vapidReady) {
      res.status(503).json({ error: "Push not configured" });
      return;
    }
    // Single source of truth для web-push — `push_subscriptions`. Дублювати
    // у push_devices не можна: sendPush читає з push_subscriptions і не
    // знатиме про записи у іншій таблиці.
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE
           SET p256dh = $3, auth = $4, user_id = $1, deleted_at = NULL`,
      [user.id, data.token, data.keys.p256dh, data.keys.auth],
    );
    res.json({ ok: true, platform: "web" });
    return;
  }

  // iOS / Android — opaque device token. Upsert по (platform, token),
  // з воскресінням soft-deleted рядків (reinstall повертає той самий token).
  await pool.query(
    `INSERT INTO push_devices (user_id, platform, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (platform, token) DO UPDATE
         SET user_id = $1, updated_at = NOW(), deleted_at = NULL`,
    [user.id, data.platform, data.token],
  );
  res.json({ ok: true, platform: data.platform });
}

/**
 * DELETE /api/push/subscribe — legacy анрег web-підписки за endpoint.
 *
 * Deprecated на користь `POST /api/v1/push/unregister`. Залишено для
 * старих web-вкладок, які ще не перезавантажили JS. Поведінка ідентична
 * web-гілці `unregister()` — той самий soft-delete у `push_subscriptions`.
 */
export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const user = (req as WithSessionUser).user!;
  const parsed = validateBody(PushUnsubscribeSchema, req, res);
  if (!parsed.ok) return;
  const { endpoint } = parsed.data;

  logger.warn({
    msg: "push_deprecation",
    deprecation:
      "DELETE /api/push/subscribe called, route to /api/v1/push/unregister",
    userId: user.id,
  });

  // Soft-delete: виставляємо deleted_at замість DELETE. Причини:
  //   1. Збережемо audit history (коли, скільки раз юзер відписувався).
  //   2. Браузери тимчасово повертають 410/404 (TTL expiry, pull-to-refresh
  //      на iOS), потім знову працюють. Hard-DELETE втратив би keys і змусив
  //      SW заново subscribe. З soft-delete наступний subscribe просто
  //      очищує deleted_at (див. вище).
  // WHERE deleted_at IS NULL робить операцію ідемпотентною: повторний
  // unsubscribe не чіпає рядок і не crash-ить constraint-и.
  await pool.query(
    `UPDATE push_subscriptions
        SET deleted_at = NOW()
      WHERE user_id = $1 AND endpoint = $2 AND deleted_at IS NULL`,
    [user.id, endpoint],
  );
  res.json({ ok: true });
}

/**
 * POST /api/v1/push/unregister — уніфікований анрег push-пристрою.
 *
 * Симетричний до `register()`. Для web — soft-delete у `push_subscriptions`
 * за `endpoint`; для ios/android — soft-delete у `push_devices` за
 * `(platform, token)`. Доступний і на `/api/push/unregister` через
 * `apiVersionRewrite`. Ідемпотентний: повторний виклик не чіпає вже
 * deleted-рядки завдяки `WHERE deleted_at IS NULL`.
 */
export async function unregister(req: Request, res: Response): Promise<void> {
  const user = (req as WithSessionUser).user!;
  const parsed = validateBody(PushUnregisterSchema, req, res);
  if (!parsed.ok) return;
  const data = parsed.data;

  if (data.platform === "web") {
    await pool.query(
      `UPDATE push_subscriptions
          SET deleted_at = NOW()
        WHERE user_id = $1 AND endpoint = $2 AND deleted_at IS NULL`,
      [user.id, data.endpoint],
    );
    res.json({ ok: true, platform: "web" });
    return;
  }

  await pool.query(
    `UPDATE push_devices
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND platform = $2 AND token = $3
        AND deleted_at IS NULL`,
    [user.id, data.platform, data.token],
  );
  res.json({ ok: true, platform: data.platform });
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Per-target user rate-limit for `/api/push/send`. Hardening item M14
 * (`docs/security/hardening/M14-internal-push-ip-allowlist.md`) calls for
 * 10 sends/minute/recipient even from valid internal callers, so a
 * compromised worker cannot loop one user into a notification flood.
 *
 * Tunable via `PUSH_SEND_TARGET_LIMIT` / `PUSH_SEND_TARGET_WINDOW_MS` for
 * incident response (raise during a legitimate broadcast, lower during
 * abuse), but the defaults match the hardening spec.
 */
const PUSH_SEND_TARGET_LIMIT = (() => {
  const raw = Number.parseInt(process.env["PUSH_SEND_TARGET_LIMIT"] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
})();
const PUSH_SEND_TARGET_WINDOW_MS = (() => {
  const raw = Number.parseInt(
    process.env["PUSH_SEND_TARGET_WINDOW_MS"] ?? "",
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
})();

/**
 * POST /api/push/send — надіслати push конкретному користувачу (внутрішній API).
 * Body: { userId, title, body, module, tag }
 *
 * Defence-in-depth (hardening item M14):
 *   1. `requireInternalIp(...)` middleware on the route restricts who can
 *      *reach* the handler at all (Railway internal CIDR + explicit
 *      allowlist). 403 with `code: IP_NOT_ALLOWED` on miss.
 *   2. `requireApiSecret("API_SECRET")` middleware verifies a constant-
 *      time-compared shared secret. 401 on miss / 503 if the secret is
 *      not configured in the env.
 *   3. The per-target-user rate limit below (10/minute by default) caps
 *      the spam an attacker who got past steps 1+2 can land on any
 *      single recipient. 429 with `code: PUSH_TARGET_RATE_LIMIT` on
 *      breach so dashboards can alert on it independently of the
 *      per-caller `api:push` bucket on the route.
 *   4. Every send (including 0-subscription no-ops, but excluding
 *      pre-fan-out 429s) appends a row to `push_send_audit` so an
 *      analyst can reconstruct who hit whom even if the audit-write
 *      itself races the response.
 */
export async function sendPush(req: Request, res: Response): Promise<void> {
  if (!vapidReady) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }

  const parsed = validateBody(PushSendSchema, req, res);
  if (!parsed.ok) return;
  const { userId, title, body, module: mod, tag } = parsed.data;

  // Per-target rate-limit BEFORE the DB read so a flooder cannot still
  // probe `push_subscriptions` shape via repeated 429s; the bucket key
  // `push:target:<userId>` is independent of the per-caller `api:push`
  // bucket attached on the router.
  const rl = await getPerTargetRateLimit("push:target", userId, {
    limit: PUSH_SEND_TARGET_LIMIT,
    windowMs: PUSH_SEND_TARGET_WINDOW_MS,
  });
  if (!rl.ok) {
    try {
      res.setHeader("Retry-After", String(rl.retryAfterSec));
    } catch {
      /* swallow header-set failures (already-sent etc.) */
    }
    res.status(429).json({
      error: "Забагато push-сповіщень для цього користувача. Спробуй пізніше.",
      code: "PUSH_TARGET_RATE_LIMIT",
    });
    return;
  }

  // EXPLAIN ANALYZE (типовий plan після міграції 005):
  //   Index Scan using idx_push_subs_user_active on push_subscriptions
  //     Index Cond: (user_id = $1)
  //     (фільтр deleted_at IS NULL уже вбудований у partial-index,
  //      тому Rows Removed by Filter = 0)
  const { rows } = await pool.query<PushSubscriptionRow>(
    `SELECT endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const callerIp = getIp(req);
  const auditPayload = {
    title,
    body: body || "",
    module: mod || null,
    tag: tag || null,
  };
  if (rows.length === 0) {
    // Even no-op sends are audited: a flood of "no subscriptions" calls
    // is itself a tell ("attacker probing for active accounts") and
    // dropping that signal on the floor would defeat the audit's
    // forensic purpose. `void` because the response has shipped — we
    // do not want to block the client on the Postgres write.
    void logPushSend({
      callerIp,
      targetUserId: userId,
      notificationType: mod ?? null,
      payload: auditPayload,
      subsCount: 0,
      sentCount: 0,
    });
    res.json({ sent: 0 });
    return;
  }

  const payload = JSON.stringify(auditPayload);
  let sent = 0;
  const stale: string[] = [];

  // Per-subscription fan-out: sendWebPush всередині вже має timeout/retry/
  // circuit-breaker і повертає структурований `outcome`. Одна невдала
  // підписка не зриває весь fan-out — Promise.all резолвиться завжди, бо
  // sendWebPush не кидає для очікуваних помилок (4xx/5xx/timeout/breaker).
  await Promise.all(
    rows.map(async (row) => {
      const sub = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const result = await sendWebPush(sub, payload);
      recordDomainOutcome(result.outcome);
      if (result.outcome === "ok") {
        sent++;
      } else if (result.outcome === "invalid_endpoint") {
        stale.push(row.endpoint);
      }
      // timeout/rate_limited/circuit_open/error — вже залоговані у sendWebPush.
    }),
  );

  if (stale.length > 0) {
    // Stale (404/410) від push-сервісу — soft-delete замість DELETE, щоб:
    //   - лишити endpoint у таблиці для analytics (кількість відпадінь);
    //   - якщо браузер знову з'явиться з тим самим endpoint у subscribe,
    //     просто очистимо deleted_at (див. `subscribe` вище) без втрати keys.
    await pool.query(
      `UPDATE push_subscriptions
          SET deleted_at = NOW()
        WHERE endpoint = ANY($1) AND deleted_at IS NULL`,
      [stale],
    );
  }

  void logPushSend({
    callerIp,
    targetUserId: userId,
    notificationType: mod ?? null,
    payload: auditPayload,
    subsCount: rows.length,
    sentCount: sent,
  });

  res.json({ sent, stale: stale.length });
}

/**
 * POST /api/v1/push/test — відправити тестовий push на всі зареєстровані
 * пристрої поточного користувача.
 *
 * Захист: `requireSession()` на рівні роутера (401 без auth) + rate-limit
 * 1 req / 5 s / user (`api:push:test`). Handler викликає `sendToUser` з
 * `apps/server/src/push/send.ts` і прокидає summary у response 1-в-1.
 *
 * Фейл `sendToUser` (throw) бульбашиться до `errorHandler` → 500 (див.
 * acceptance: «failure-path → 500 з summary»). Інші помилки (per-device
 * 4xx/5xx від APNs/FCM) лишаються всередині `summary.errors`, щоб клієнт
 * бачив, на який саме пристрій не доставилось.
 */
export async function pushTest(req: Request, res: Response): Promise<void> {
  const user = (req as WithSessionUser).user!;
  const parsed = validateBody(PushTestRequestSchema, req, res);
  if (!parsed.ok) return;
  const payload = parsed.data;

  const summary = await sendToUser(user.id, {
    title: payload.title,
    body: payload.body,
    data: payload.data,
    url: payload.url,
    silent: payload.silent,
  });

  res.json(summary);
}
