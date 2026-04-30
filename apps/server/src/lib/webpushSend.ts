import webpush, { WebPushError } from "web-push";
import type { PushSubscription } from "web-push";
import { logger } from "../obs/logger.js";
import { recordExternalHttp } from "./externalHttp.js";

/**
 * Transport-шар для `webpush.sendNotification`. Додає:
 *
 *   1. AbortController-таймаут (web-push library сама таймаут не підтримує).
 *      Без нього повільний push-сервіс тримав би async-задачу живою аж до
 *      TCP RST, а при `sendPush` fan-out-і ще й блокував би pg-connection.
 *   2. Per-origin circuit breaker. Коли FCM/Apple/Mozilla-проксі деградує,
 *      подальші виклики до того ж origin-а одразу fail-fast-ять → fan-out
 *      не витрачає ресурси на заздалегідь приречені запити.
 *   3. Один retry на timeout/5xx з малим backoff. 4xx (400/403/404/410/413)
 *      не ретраїмо — це per-subscription семантика (неправильний ключ,
 *      gone endpoint, невалідний payload).
 *   4. Уніфіковані метрики через `recordExternalHttp("push", outcome, ms)`.
 *
 * Класифікація результату повертається у `WebPushSendResult.outcome`:
 *
 *   ok              — successfull delivery (2xx)
 *   invalid_endpoint — 404/410 → soft-delete підписки (caller вирішує)
 *   rate_limited    — 429
 *   timeout         — AbortController спрацював
 *   circuit_open    — breaker open, запит навіть не відправлявся
 *   error           — все інше (4xx crypto/validation, 5xx після retry,
 *                     мережева помилка)
 *
 * Wrapper НЕ кидає для упаковних помилок — повертає result-обʼєкт з
 * `outcome` і зберігає оригінальний `error` для логування caller-ом.
 * Це свідоме: push fan-out у `sendPush` паралелить N підписок, і одна
 * невдала не повинна рвати загальну Promise.all.
 */

type BreakerState = {
  failures: number;
  openUntil: number;
};

interface WebPushConfig {
  timeoutMs: number;
  retryDelaysMs: number[];
  retryJitterMs: number;
  breakerFailThreshold: number;
  breakerOpenMs: number;
}

interface WebPushMutableState extends WebPushConfig {
  breakers: Map<string, BreakerState>;
}

const DEFAULTS: Readonly<WebPushConfig> = Object.freeze({
  timeoutMs: 10_000,
  // [first-attempt-delay, retry-delay]. Нульова перша затримка + один retry.
  retryDelaysMs: [0, 500],
  retryJitterMs: 100,
  breakerFailThreshold: 5,
  breakerOpenMs: 30_000,
});

const state: WebPushMutableState = {
  timeoutMs: DEFAULTS.timeoutMs,
  retryDelaysMs: [...DEFAULTS.retryDelaysMs],
  retryJitterMs: DEFAULTS.retryJitterMs,
  breakerFailThreshold: DEFAULTS.breakerFailThreshold,
  breakerOpenMs: DEFAULTS.breakerOpenMs,
  breakers: new Map(),
};

export type WebPushOutcome =
  | "ok"
  | "invalid_endpoint"
  | "rate_limited"
  | "timeout"
  | "circuit_open"
  | "error";

export interface WebPushSendResult {
  outcome: WebPushOutcome;
  /** Upstream HTTP status, якщо відомо. Timeout/circuit — undefined. */
  statusCode?: number;
  /** Серіалізоване повідомлення помилки для логування caller-ом. */
  errorMessage?: string;
  /** Весь час wrapper-а, включно з breaker-check і retry-sleep-ами. */
  durationMs: number;
  /** Скільки разів реально викликали webpush.sendNotification. */
  attempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay(base: number): number {
  if (base <= 0) return 0;
  return base + Math.floor(Math.random() * state.retryJitterMs);
}

/**
 * Ключ для breaker-а — origin push-ендпоінту (схема+host), НЕ повний endpoint.
 * FCM/Apple/Mozilla мають одиничні origin-и, і деградація там глобальна —
 * відмічаємо весь сервіс, а не per-subscription.
 */
function originOf(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "unknown";
  }
}

function getBreaker(origin: string): BreakerState {
  let s = state.breakers.get(origin);
  if (!s) {
    s = { failures: 0, openUntil: 0 };
    state.breakers.set(origin, s);
  }
  return s;
}

function onBreakerFailure(origin: string): void {
  const s = getBreaker(origin);
  s.failures += 1;
  if (s.failures >= state.breakerFailThreshold) {
    s.openUntil = Date.now() + state.breakerOpenMs;
  }
}

function onBreakerSuccess(origin: string): void {
  const s = getBreaker(origin);
  s.failures = 0;
  s.openUntil = 0;
}

function isBreakerOpen(origin: string): boolean {
  const s = getBreaker(origin);
  if (!s.openUntil) return false;
  if (Date.now() < s.openUntil) return true;
  // Half-open: вікно минуло → дозволяємо один пробний запит. Успіх
  // обнулить `failures`, fail-ла знову зведе `openUntil` у майбутнє.
  s.openUntil = 0;
  return false;
}

function isRetryableStatus(s?: number): boolean {
  return typeof s === "number" && s >= 500 && s <= 599;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: string | number };
  return (
    err.name === "AbortError" || err.code === "ABORT_ERR" || err.code === 20
  );
}

/**
 * Promise.race з таймаут-обіцянкою. web-push library не приймає AbortSignal,
 * тож AbortController тут — це контракт сigналу: ми НЕ можемо примусово
 * перервати https-запит під капотом, але можемо вчасно відпустити event-loop
 * / caller-а. Висячий socket закриється сам по серверному TCP-keepalive.
 */
async function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timeout after ${timeoutMs}ms`);
      (err as Error & { name: string }).name = "AbortError";
      controller.abort();
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SendOptions {
  timeoutMs?: number;
}

/**
 * Єдина точка відправки web-push-у. Заміна прямому виклику
 * `webpush.sendNotification(sub, payload)`. Не кидає для передбачуваних
 * помилок — повертає структурований `WebPushSendResult`.
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  options: SendOptions = {},
): Promise<WebPushSendResult> {
  const timeoutMs = options.timeoutMs ?? state.timeoutMs;
  const origin = originOf(subscription.endpoint);
  const start = process.hrtime.bigint();
  const elapsed = (): number => Number(process.hrtime.bigint() - start) / 1e6;

  if (isBreakerOpen(origin)) {
    const ms = elapsed();
    recordExternalHttp("push", "circuit_open", ms);
    return {
      outcome: "circuit_open",
      durationMs: ms,
      attempts: 0,
    };
  }

  const maxAttempts = state.retryDelaysMs.length;
  let lastError: unknown = undefined;
  let lastStatus: number | undefined = undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = jitteredDelay(state.retryDelaysMs[attempt]);
    if (delay > 0) await sleep(delay);

    const controller = new AbortController();
    try {
      await withTimeout(
        webpush.sendNotification(subscription, payload),
        timeoutMs,
        controller,
      );
      // 2xx — успіх.
      const ms = elapsed();
      onBreakerSuccess(origin);
      recordExternalHttp("push", "ok", ms);
      return {
        outcome: "ok",
        statusCode: 201,
        durationMs: ms,
        attempts: attempt + 1,
      };
    } catch (e: unknown) {
      lastError = e;
      const timedOut = isAbortError(e);
      const status = e instanceof WebPushError ? e.statusCode : undefined;
      lastStatus = status;

      // Ретраїмо лише timeout або 5xx. Все інше (4xx, crypto, невідоме) —
      // ваговий сигнал per-subscription, retry не допоможе.
      const retryable =
        (timedOut || isRetryableStatus(status)) && attempt < maxAttempts - 1;
      if (retryable) continue;
      break;
    }
  }

  // Фіналізуємо outcome для не-успіху.
  const ms = elapsed();
  const timedOut = isAbortError(lastError);
  const message =
    lastError instanceof Error
      ? lastError.message
      : String(lastError ?? "unknown");

  if (timedOut) {
    onBreakerFailure(origin);
    recordExternalHttp("push", "timeout", ms);
    logger.warn({
      msg: "push_send_timeout",
      origin,
      timeoutMs,
      err: { message },
    });
    return {
      outcome: "timeout",
      durationMs: ms,
      errorMessage: message,
      attempts: maxAttempts,
    };
  }

  if (lastStatus === 404 || lastStatus === 410) {
    // 404/410 — не availability-issue, breaker НЕ торкаємо.
    recordExternalHttp("push", "invalid_endpoint", ms);
    return {
      outcome: "invalid_endpoint",
      statusCode: lastStatus,
      durationMs: ms,
      errorMessage: message,
      attempts: maxAttempts,
    };
  }

  if (lastStatus === 429) {
    // Throttle від push-сервісу — не availability-issue.
    recordExternalHttp("push", "rate_limited", ms);
    logger.warn({
      msg: "push_rate_limited",
      status: lastStatus,
      err: { message },
    });
    return {
      outcome: "rate_limited",
      statusCode: lastStatus,
      durationMs: ms,
      errorMessage: message,
      attempts: maxAttempts,
    };
  }

  // 5xx після retry або невідома помилка → breaker-фейл.
  if (isRetryableStatus(lastStatus) || lastStatus === undefined) {
    onBreakerFailure(origin);
  }
  recordExternalHttp("push", "error", ms);
  logger.warn({
    msg: "push_send_error",
    status: lastStatus,
    err: { message },
  });
  return {
    outcome: "error",
    statusCode: lastStatus,
    durationMs: ms,
    errorMessage: message,
    attempts: maxAttempts,
  };
}

export interface WebPushSendTestHooks {
  configure(overrides: Partial<WebPushConfig>): void;
  reset(): void;
  state: WebPushMutableState;
}

/** Test-only hooks. Не використовуй у прод-коді. */
export function __webpushSendTestHooks(): WebPushSendTestHooks {
  return {
    configure(overrides) {
      Object.assign(state, overrides);
    },
    reset() {
      state.breakers.clear();
      state.timeoutMs = DEFAULTS.timeoutMs;
      state.retryDelaysMs = [...DEFAULTS.retryDelaysMs];
      state.retryJitterMs = DEFAULTS.retryJitterMs;
      state.breakerFailThreshold = DEFAULTS.breakerFailThreshold;
      state.breakerOpenMs = DEFAULTS.breakerOpenMs;
    },
    state,
  };
}
