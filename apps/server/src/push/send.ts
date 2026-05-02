import apn from "@parse/node-apn";
import pool from "../db.js";
import { sendWebPush } from "../lib/webpushSend.js";
import { logger } from "../obs/logger.js";
import { pushSendsTotal } from "../obs/metrics.js";
import { apnsBundleId, getApnsProvider } from "./apnsClient.js";
import { fcmProjectId, getFcmAccessToken } from "./fcmClient.js";
import type { PushPayload, PushPlatform, SendToUserResult } from "./types.js";

export type { PushPayload, SendToUserResult } from "./types.js";

/**
 * Єдина точка для серверного fan-out push-у.
 *
 *   `sendToUser(userId, payload)` читає всі активні пристрої юзера з
 *   `push_devices` (+ web-push-підписки з `push_subscriptions`) і
 *   паралельно відправляє payload на APNs/FCM/web. Повертає аґреговану
 *   статистику; nobody-home (юзер без жодного пристрою) — не помилка,
 *   віддаємо {delivered:{0,0,0}, cleaned:0, errors:[]}.
 *
 * Сам `sendToUser` НЕ кидає — у fan-out-і одна впала платформа не має
 * валити решту. Винятки з мережевих слоїв обгортаємо у структуровані
 * `errors[]` і логуємо.
 */

// ─────────────────────────── Retry policy ───────────────────────────
// Exponential backoff: 3 total attempts, delays between them 200 ms / 1 s / 3 s.
// Без значної jitter-и — native push-сервіси мають стабільний QPS ліміт і
// перевантаження тут — рідкість; 200/1000/3000 — стандартна послідовність
// що дає ~4.2 с worst-case на один токен до повернення failed.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS: readonly number[] = [200, 1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────── Metrics ───────────────────────────────
/**
 * Інкрементуємо `push_sends_total{outcome}` для узгодження з існуючими
 * дашбордами web-push-у. try/catch — metrics ніколи не мають ламати send.
 */
function recordDomainOutcome(outcome: string): void {
  try {
    pushSendsTotal.inc({ outcome });
  } catch {
    /* ignore */
  }
}

// ─────────────────────────── DB layer ──────────────────────────────
interface DeviceRow {
  token: string;
  platform: "ios" | "android";
}

interface WebSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function loadNativeDevices(userId: string): Promise<DeviceRow[]> {
  const { rows } = await pool.query<DeviceRow>(
    `SELECT token, platform
       FROM push_devices
      WHERE user_id = $1
        AND platform IN ('ios', 'android')
        AND deleted_at IS NULL`,
    [userId],
  );
  return rows;
}

async function loadWebSubscriptions(userId: string): Promise<WebSubRow[]> {
  const { rows } = await pool.query<WebSubRow>(
    `SELECT endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return rows;
}

/**
 * Permanently remove a native device token. APNs 410/BadDeviceToken/
 * Unregistered and FCM UNREGISTERED/INVALID_ARGUMENT signal that the token
 * is not valid any more (app uninstalled, token rotated, wrong env). Keeping
 * the row around would mean retry-storming the upstream на кожному пуші.
 */
async function deleteNativeDevice(
  userId: string,
  platform: "ios" | "android",
  token: string,
  reason: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM push_devices WHERE platform = $1 AND token = $2`,
    [platform, token],
  );
  logger.info({
    msg: "push_dead_token_cleanup",
    user_id: userId,
    platform,
    reason,
  });
}

/**
 * Soft-delete a stale web-push subscription. Mirror семантики існуючого
 * `sendPush` handler-а — `push_subscriptions` live-soft-delete, не hard DELETE.
 */
async function softDeleteWebSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await pool.query(
    `UPDATE push_subscriptions
        SET deleted_at = NOW()
      WHERE endpoint = $1 AND deleted_at IS NULL`,
    [endpoint],
  );
  logger.info({
    msg: "push_dead_token_cleanup",
    user_id: userId,
    platform: "web",
    reason: "invalid_endpoint",
  });
}

// ─────────────────────────── APNs send ─────────────────────────────
interface SendOutcome {
  delivered: boolean;
  /** Upstream classified this token as permanently invalid — caller deletes. */
  dead: boolean;
  /** Error reason if we want to record it in `errors[]`. */
  error?: string;
}

/**
 * Send a single APNs notification with retry. `@parse/node-apn` вже
 * обгортає http2-транспорт і повертає структурований `{sent, failed}` замість
 * throw-а для upstream-помилок. Ми покриваємо його лише retry-логікою й
 * класифікацією «dead-token vs transient vs permanent».
 *
 * Exported for unit testing.
 */
export async function sendAPNs(
  userId: string,
  token: string,
  payload: PushPayload,
): Promise<SendOutcome> {
  const provider = getApnsProvider();
  const bundleId = apnsBundleId();
  if (!provider || !bundleId) {
    return { delivered: false, dead: false, error: "apns_disabled" };
  }

  const note = new apn.Notification();
  note.topic = bundleId;
  if (payload.silent) {
    // Background/silent push. Apple вимагає ВСІ три одночасно, інакше APNs
    // або віддасть `BadDeviceToken` (без push-type header), або доставить
    // як alert-push з пустим title (content-available без відповідного
    // priority 5 → «low-priority data delivery»; з priority 10 + no alert
    // APNs повертає 400 InvalidPushType).
    //   https://developer.apple.com/documentation/usernotifications/
    //     setting-up-a-remote-notification-server/
    //     sending-notification-requests-to-apns
    note.pushType = "background";
    note.priority = 5;
    note.contentAvailable = true;
    // alert/sound навмисно не ставимо — inline banner у silent-push поламає
    // семантику (iOS не має показувати UI, лише збудити додаток у бекграунді).
  } else {
    note.alert = { title: payload.title, body: payload.body ?? "" };
    note.sound = "default";
  }
  if (typeof payload.badge === "number") note.badge = payload.badge;
  if (payload.threadId) note.threadId = payload.threadId;
  // APNs дозволяє довільні top-level поля поруч з `aps`. Мокаємо це через
  // `note.payload`, щоб клієнт отримав payload.data як частину notification.
  // Top-level `payload.url` має пріоритет над `data.url` — вирівнюємо з
  // FCM-гілкою та з комментарем у `PushPayload`.
  const rootPayload: Record<string, unknown> = { ...(payload.data ?? {}) };
  if (typeof payload.url === "string" && payload.url.length > 0) {
    rootPayload.url = payload.url;
  }
  if (Object.keys(rootPayload).length > 0) {
    note.payload = rootPayload;
  }

  let lastReason = "unknown";
  let lastStatus: number | undefined = undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);

    let result: apn.Responses<apn.ResponseSent, apn.ResponseFailure>;
    try {
      result = await provider.send(note, token);
    } catch (e) {
      // Мережеві/http2-помилки node-apn кидає throw-ом; класифікуємо як
      // transient і даємо ретрай шанс — це часто просто rekey-розрив.
      lastReason = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_ATTEMPTS - 1) continue;
      logger.warn({
        msg: "apns_send_error",
        user_id: userId,
        err: { message: lastReason },
      });
      return { delivered: false, dead: false, error: lastReason };
    }

    if (result.sent.length > 0) {
      return { delivered: true, dead: false };
    }

    const failure = result.failed[0];
    lastStatus =
      failure?.status !== undefined ? Number(failure.status) : undefined;
    lastReason =
      failure?.response?.reason ?? failure?.error?.message ?? "unknown";

    // 410 у будь-якій формі, плюс BadDeviceToken/Unregistered — безповоротно
    // мертвий token. Apple явно рекомендує DELETE у таких випадках
    // (https://developer.apple.com/documentation/usernotifications — Error codes).
    const dead =
      lastStatus === 410 ||
      lastReason === "BadDeviceToken" ||
      lastReason === "Unregistered";
    if (dead) {
      return { delivered: false, dead: true, error: lastReason };
    }

    // Транзієнтні: 5xx (Apple internal), 429 (rate-limit). Решта 4xx —
    // per-payload/per-cred помилки, retry не допоможе (InvalidPushType,
    // PayloadTooLarge, etc).
    const transient =
      (typeof lastStatus === "number" &&
        lastStatus >= 500 &&
        lastStatus < 600) ||
      lastStatus === 429;
    if (transient && attempt < MAX_ATTEMPTS - 1) continue;
    break;
  }

  logger.warn({
    msg: "apns_send_failed",
    user_id: userId,
    status: lastStatus,
    reason: lastReason,
  });
  return { delivered: false, dead: false, error: lastReason };
}

// ─────────────────────────── FCM send ──────────────────────────────
/**
 * FCM error status codes that mean the token is permanently invalid. See
 * https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode.
 *
 * `INVALID_ARGUMENT` навмисно НЕ у цьому сеті: FCM v1 повертає його як для
 * зламаного токена, так і для malformed-payload (наприклад, data зі значенням
 * не-string — див. `stringifyDataMap`). Payload однаковий для всього fan-out-у,
 * тож класифікація INVALID_ARGUMENT як dead означала б, що один багнутий
 * payload знесе ВСІ Android-токени юзера разом. Краще лишити їх й дати мережі
 * діагностувати, ніж проактивно видаляти валідні.
 *
 * `SENDER_ID_MISMATCH` — токен зареєстровано під іншим Firebase project, нашим
 * проектом він ніколи не стане валідним → видаляємо.
 *
 * `NOT_FOUND` — не канонічний v1-код, але історично зустрічається у v1 wrappers
 * і legacy HTTP API; лишаємо на випадок, якщо хтось прокинеться з старого SDK.
 */
const FCM_DEAD_STATUSES = new Set([
  "UNREGISTERED",
  "SENDER_ID_MISMATCH",
  "NOT_FOUND",
]);

interface FcmErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ errorCode?: string; "@type"?: string }>;
  };
}

/**
 * Send a single FCM HTTP v1 notification with retry. Повертає виключно
 * класифіковані результати — трансопртні помилки (network/auth/etc.) йдуть
 * у `error` без dead-cleanup, токен-level помилки → `dead: true`.
 *
 * Exported for unit testing.
 */
export async function sendFCM(
  userId: string,
  token: string,
  payload: PushPayload,
): Promise<SendOutcome> {
  const projectId = fcmProjectId();
  if (!projectId) {
    return { delivered: false, dead: false, error: "fcm_disabled" };
  }

  // Формуємо `data` заздалегідь: payload.data → map<string,string> + опційно
  // `url`. Top-level `payload.url` має пріоритет — якщо юзер передав обидва
  // (не повинен, але буває), top-level перезаписує поле у data, щоб контракт
  // з APNs (де url завжди з top-level) збігався.
  const dataMap: Record<string, string> = payload.data
    ? stringifyDataMap(payload.data)
    : {};
  if (typeof payload.url === "string" && payload.url.length > 0) {
    dataMap.url = payload.url;
  }

  // silent — data-only повідомлення. FCM v1:
  //   - НЕ додаємо `message.notification` (інакше Android покаже banner;
  //     iOS теж покаже alert, навіть з apns.payload.aps.content-available=1,
  //     бо `notification` block мапиться у aps.alert на upstream-стороні).
  //   - `android.priority=high` — інакше FCM доставляє data-only як «normal»,
  //     що може затриматись або не збудити додаток з Doze.
  //   - `apns.headers.apns-push-type=background` + `apns-priority=5` +
  //     `apns.payload.aps.content-available=1` — дублюємо те саме, що APNs-
  //     гілка робить для iOS напряму. Без цих заголовків FCM-проксі до APNs
  //     відхиляє background push з 400 (див. коментар у `sendAPNs`).
  //
  // non-silent: звична `notification`-гілка з опційним `apns.payload.aps.badge`.
  const messageCore: Record<string, unknown> = {
    token,
    ...(Object.keys(dataMap).length > 0 ? { data: dataMap } : {}),
  };
  if (payload.silent) {
    messageCore.android = { priority: "high" };
    messageCore.apns = {
      headers: { "apns-push-type": "background", "apns-priority": "5" },
      payload: { aps: { "content-available": 1 } },
    };
  } else {
    messageCore.notification = {
      title: payload.title,
      body: payload.body ?? "",
    };
    if (typeof payload.badge === "number") {
      messageCore.apns = { payload: { aps: { badge: payload.badge } } };
    }
  }
  const body = { message: messageCore };
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/messages:send`;

  let lastReason = "unknown";
  let lastStatus: number | undefined = undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);

    let accessToken: string | null;
    try {
      accessToken = await getFcmAccessToken();
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
      // OAuth-flap є транзієнтним (Google token endpoint 5xx/network).
      if (attempt < MAX_ATTEMPTS - 1) continue;
      logger.warn({
        msg: "fcm_token_fetch_failed",
        user_id: userId,
        err: { message: lastReason },
      });
      return { delivered: false, dead: false, error: lastReason };
    }
    if (!accessToken) {
      return { delivered: false, dead: false, error: "fcm_disabled" };
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_ATTEMPTS - 1) continue;
      logger.warn({
        msg: "fcm_send_network_error",
        user_id: userId,
        err: { message: lastReason },
      });
      return { delivered: false, dead: false, error: lastReason };
    }

    lastStatus = resp.status;
    if (resp.status >= 200 && resp.status < 300) {
      return { delivered: true, dead: false };
    }

    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {
      /* ignore — worst case lastReason залишається status */
    }
    const parsed = safeParseFcmError(bodyText);
    const statusName = parsed?.error?.status;
    const detailCode = parsed?.error?.details?.find(
      (d) => typeof d.errorCode === "string",
    )?.errorCode;
    lastReason =
      statusName ??
      detailCode ??
      parsed?.error?.message ??
      (bodyText.slice(0, 200) || String(resp.status));

    const effectiveCode = statusName ?? detailCode;
    const dead =
      effectiveCode !== undefined && FCM_DEAD_STATUSES.has(effectiveCode);
    if (dead) {
      return { delivered: false, dead: true, error: lastReason };
    }

    // 5xx / 429 — transient. Все інше (400 без dead-коду, 401/403 —
    // мис-конфіг) не варто ретраїти: ретраєм через 200 мс ти все одно
    // отримаєш ту ж саму 401.
    const transient = resp.status >= 500 || resp.status === 429;
    if (transient && attempt < MAX_ATTEMPTS - 1) continue;
    break;
  }

  logger.warn({
    msg: "fcm_send_failed",
    user_id: userId,
    status: lastStatus,
    reason: lastReason,
  });
  return { delivered: false, dead: false, error: lastReason };
}

function safeParseFcmError(raw: string): FcmErrorBody | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FcmErrorBody;
  } catch {
    return null;
  }
}

function stringifyDataMap(
  data: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

// ─────────────────────────── Public API ────────────────────────────
/**
 * Delivery dispatcher. Реальне API для caller-ів (coach, reminders, …).
 *
 * Контракт:
 *   - no-op + `errors=[]` коли у юзера жодного пристрою.
 *   - transient fails → count у `errors[]`, не cleanup.
 *   - token-dead fails → cleanup + count у `cleaned`.
 *   - ніколи не throw-ає (винятки БД всередині Promise.all промокають
 *     нагору лише у разі повної недоступності `pool.query`, яке й так
 *     класифікується як critical-alert у sentry).
 */
export async function sendToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendToUserResult> {
  const result: SendToUserResult = {
    delivered: { ios: 0, android: 0, web: 0 },
    cleaned: 0,
    errors: [],
  };

  const [devices, webSubs] = await Promise.all([
    loadNativeDevices(userId),
    loadWebSubscriptions(userId),
  ]);

  if (devices.length === 0 && webSubs.length === 0) {
    return result;
  }

  // Web-push service-worker читає `payload.data.url` для deep-link-routing-у;
  // тримаємо форму узгодженою з APNs/FCM (`data.url` — єдине джерело правди).
  // `silent` на web навмисно НЕ прокидаємо — service-worker сам вирішує, чи
  // показувати banner; зміна поведінки тут — окремий PR.
  const webData: Record<string, unknown> | null = (() => {
    const url = typeof payload.url === "string" ? payload.url : undefined;
    if (payload.data && Object.keys(payload.data).length > 0) {
      return url ? { ...payload.data, url } : { ...payload.data };
    }
    return url ? { url } : (payload.data ?? null);
  })();
  const webPayloadJson = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    data: webData,
  });

  // Per-device Promise.all. Одна впала не рве fan-out: кожен sender-ок
  // повертає або SendOutcome, або структурований error.
  const tasks: Promise<void>[] = [];

  for (const d of devices) {
    if (d.platform === "ios") {
      tasks.push(
        sendAPNs(userId, d.token, payload).then(async (r) => {
          await applyNativeOutcome(result, userId, "ios", d.token, r);
        }),
      );
    } else if (d.platform === "android") {
      tasks.push(
        sendFCM(userId, d.token, payload).then(async (r) => {
          await applyNativeOutcome(result, userId, "android", d.token, r);
        }),
      );
    }
  }

  for (const sub of webSubs) {
    tasks.push(
      sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        webPayloadJson,
      ).then(async (wr) => {
        recordDomainOutcome(wr.outcome);
        if (wr.outcome === "ok") {
          result.delivered.web++;
          return;
        }
        if (wr.outcome === "invalid_endpoint") {
          result.cleaned++;
          try {
            await softDeleteWebSubscription(userId, sub.endpoint);
          } catch (e) {
            logger.warn({
              msg: "web_push_cleanup_failed",
              user_id: userId,
              err: { message: e instanceof Error ? e.message : String(e) },
            });
          }
          return;
        }
        // rate_limited / timeout / circuit_open / error — логуємо per-push,
        // і реєструємо як error-запис (без cleanup).
        result.errors.push({
          platform: "web",
          reason: wr.errorMessage ?? wr.outcome,
        });
      }),
    );
  }

  await Promise.all(tasks);

  return result;
}

async function applyNativeOutcome(
  result: SendToUserResult,
  userId: string,
  platform: "ios" | "android",
  token: string,
  r: SendOutcome,
): Promise<void> {
  if (r.delivered) {
    result.delivered[platform]++;
    recordDomainOutcome("ok");
    return;
  }
  if (r.dead) {
    result.cleaned++;
    recordDomainOutcome("invalid_endpoint");
    try {
      await deleteNativeDevice(userId, platform, token, r.error ?? "unknown");
    } catch (e) {
      logger.warn({
        msg: "native_token_cleanup_failed",
        user_id: userId,
        platform,
        err: { message: e instanceof Error ? e.message : String(e) },
      });
    }
    return;
  }
  recordDomainOutcome("error");
  result.errors.push({
    platform: platform as PushPlatform,
    reason: r.error ?? "unknown",
  });
}

// ─────────────────────────── Fire-and-forget helper ────────────────
/**
 * Тонка обгортка над `sendToUser` для «side-effect»-ів у бізнес-флоу
 * (coach nudges, reminders job, тощо). Логує summary у форматі
 * `push: delivered ios=X android=Y web=Z` і **ковтає** помилки, щоб push
 * ніколи не валив головний флоу. Використовуй з `void ...` на callsite-і,
 * якщо caller не чекає на Promise.
 */
export async function sendToUserQuietly(
  userId: string,
  payload: PushPayload,
  context: { module: string },
): Promise<void> {
  try {
    const summary = await sendToUser(userId, payload);
    logger.info({
      msg: `push: delivered ios=${summary.delivered.ios} android=${summary.delivered.android} web=${summary.delivered.web}`,
      module: context.module,
      user_id: userId,
      cleaned: summary.cleaned,
      errors: summary.errors.length,
    });
  } catch (err) {
    logger.warn({
      msg: "push.sendToUser failed (swallowed)",
      module: context.module,
      user_id: userId,
      err: { message: err instanceof Error ? err.message : String(err) },
    });
  }
}
