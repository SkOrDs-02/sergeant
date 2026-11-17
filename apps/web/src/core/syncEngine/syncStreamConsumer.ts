/**
 * Клієнтський споживач `GET /api/v2/sync/stream` (Фаза 3 `sync-client-wiring`).
 *
 * AI-DANGER: живий кадр `op` є лише сигналом «на сервері є нове, зроби pull»,
 * а не курсором. Стрім іде в порядку коміту й без серверних оп-ів, тож
 * `Last-Event-ID` як курсор pull перескочив би оп-и (див. `syncV2Stream.ts`).
 * Дані кадрів тут не читаються і ніколи не застосовуються: їх застосовує
 * `pullOnce`, який іде з курсором `sync_op_cursor`.
 *
 * Звичайний `EventSource` не вміє слати `X-Origin-Device-Id`, без якого сервер
 * не відсікає власні записи пристрою, тому стрім читається через `fetch`.
 *
 * Маршрут за прапорцем `SYNC_V2_STREAM_ENABLED` (дефолт off, 404). 404 і 401
 * не повторюються часто: клієнт відкладає наступну спробу на довгий строк, а
 * польовий pull (інтервал, `visibilitychange`, після push) працює як і раніше.
 */

export interface SyncStreamConsumerDeps {
  /** Абсолютний або відносний URL без query (`since` додає споживач). */
  readonly url: string;
  readonly originDeviceId: string;
  /**
   * Курсор `sync_op_cursor` поточного юзера: за ним сервер робить replay.
   * `null` - користувача ще немає (анонім), стрім не відкриваємо.
   */
  readonly getSince: () => Promise<number | null>;
  /** Сигнал «зроби pull». Споживач сам дебаунсить. */
  readonly onSignal: () => void;
  readonly fetch?: typeof fetch;
  readonly setTimeout?: (handler: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  /** `[0,1)`; лише для джитера бекофу. */
  readonly random?: () => number;
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

export interface SyncStreamConsumer {
  start(): void;
  stop(): void;
}

/** Дрібні кадри `op` одного push-batch зливаються в один pull. */
export const SYNC_STREAM_SIGNAL_DEBOUNCE_MS = 750;
export const SYNC_STREAM_RECONNECT_MIN_MS = 1_000;
export const SYNC_STREAM_RECONNECT_MAX_MS = 60_000;
/** Прапорець вимкнено (404) або сесії немає (401/403): не смикаємо часто. */
export const SYNC_STREAM_DISABLED_RETRY_MS = 30 * 60_000;

interface SseFrame {
  readonly event: string;
  readonly data: string;
}

/** Розбирає накопичений буфер на готові кадри; повертає хвіст, що не добіг. */
export function parseSseFrames(buffer: string): {
  readonly frames: SseFrame[];
  readonly rest: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: SseFrame[] = [];
  for (const part of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      // `: heartbeat` та інші SSE-коментарі.
      if (line === "" || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0 || event !== "message") {
      frames.push({ event, data: data.join("\n") });
    }
  }
  return { frames, rest };
}

export function createSyncStreamConsumer(
  deps: SyncStreamConsumerDeps,
): SyncStreamConsumer {
  const doFetch = deps.fetch ?? ((...args) => fetch(...args));
  const setTimer =
    deps.setTimeout ?? ((handler, ms) => globalThis.setTimeout(handler, ms));
  const clearTimer =
    deps.clearTimeout ??
    ((handle) => globalThis.clearTimeout(handle as number));
  const random = deps.random ?? Math.random;

  let running = false;
  let controller: AbortController | null = null;
  let reconnectTimer: unknown = null;
  let signalTimer: unknown = null;
  let failures = 0;

  function signal(): void {
    if (signalTimer !== null) return;
    signalTimer = setTimer(() => {
      signalTimer = null;
      if (running) deps.onSignal();
    }, SYNC_STREAM_SIGNAL_DEBOUNCE_MS);
  }

  function scheduleReconnect(delayMs: number): void {
    if (!running) return;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      void connect();
    }, delayMs);
  }

  function backoffMs(): number {
    const base = Math.min(
      SYNC_STREAM_RECONNECT_MAX_MS,
      SYNC_STREAM_RECONNECT_MIN_MS * 2 ** Math.min(failures, 6),
    );
    return Math.floor(base * (0.5 + random() * 0.5));
  }

  async function connect(): Promise<void> {
    if (!running) return;
    const ctrl = new AbortController();
    controller = ctrl;
    try {
      const since = await deps.getSince();
      if (!running || ctrl.signal.aborted) return;
      if (since === null) {
        scheduleReconnect(SYNC_STREAM_RECONNECT_MAX_MS);
        return;
      }
      const response = await doFetch(`${deps.url}?since=${since}`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "text/event-stream",
          "X-Origin-Device-Id": deps.originDeviceId,
        },
        signal: ctrl.signal,
      });
      if (
        response.status === 404 ||
        response.status === 401 ||
        response.status === 403
      ) {
        scheduleReconnect(SYNC_STREAM_DISABLED_RETRY_MS);
        return;
      }
      if (!response.ok || !response.body) {
        failures += 1;
        scheduleReconnect(backoffMs());
        return;
      }
      failures = 0;
      await readFrames(response.body, ctrl.signal);
      // Нормальне закриття (`closed`, max_age, обрив проксі): перепідключення.
      scheduleReconnect(backoffMs());
    } catch (error) {
      if (ctrl.signal.aborted || !running) return;
      failures += 1;
      deps.captureException?.(error, { scope: "sync-v2-stream" });
      scheduleReconnect(backoffMs());
    }
  }

  async function readFrames(
    body: ReadableStream<Uint8Array>,
    abort: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let caughtUp = false;
    let sawBacklogOp = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || abort.aborted) return;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          if (frame.event === "op") {
            // Replay до `caught_up` - це догін, який `pullOnce` і так зробить;
            // один сигнал на весь backlog, а не по кадру.
            if (caughtUp) signal();
            else sawBacklogOp = true;
          } else if (frame.event === "caught_up") {
            caughtUp = true;
            if (sawBacklogOp) {
              sawBacklogOp = false;
              signal();
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      failures = 0;
      void connect();
    },
    stop() {
      running = false;
      controller?.abort();
      controller = null;
      if (reconnectTimer !== null) clearTimer(reconnectTimer);
      if (signalTimer !== null) clearTimer(signalTimer);
      reconnectTimer = null;
      signalTimer = null;
    },
  };
}
