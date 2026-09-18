/**
 * Cross-context bridge для shell-deep-link навігації — `apps/mobile-shell`
 * (Capacitor WebView script) надсилає, `apps/web/src/core/app/
 * ShellDeepLinkBridge.tsx` слухає. Реалізовано через стандартний
 * `BroadcastChannel` API (stack-pulse PR-29).
 *
 * Delivery paths (PR-29 PR-2):
 *   1. **BroadcastChannel** — canonical, коли WebView підтримує API і web-bridge
 *      змонтований.
 *   2. **`window.__sergeantShellDeepLinkQueue`** — cold-start / BC-less WebView;
 *      web drain-ить при mount-і або на `SHELL_DEEPLINK_QUEUE_EVENT`.
 *
 * Чому не global function на `window`: race-free listener, testable API,
 * без mutable global handler-ів під HMR.
 */

/** Назва BroadcastChannel — мусить збігатись на shell і web side. */
export const SHELL_DEEPLINK_CHANNEL = "sergeant-shell-deeplink";

/** Pre-mount queue на `window` — shell push-ить, web drain-ить. */
export const SHELL_DEEPLINK_QUEUE_KEY = "__sergeantShellDeepLinkQueue";

/** Web виставляє `true` після mount-у `ShellDeepLinkBridge`. */
export const SHELL_DEEPLINK_BRIDGE_READY_KEY =
  "__sergeantShellDeepLinkBridgeReady";

/** CustomEvent для drain queue після mount-у (BC-less WebView). */
export const SHELL_DEEPLINK_QUEUE_EVENT = "sergeant-shell-deeplink-queue";

/**
 * Версія wire-формату повідомлення. Bump-имо коли змінюємо shape
 * `DeepLinkMessage` так, що старий receiver не зможе його розпарсити.
 * Receivers ігнорують повідомлення з `protocolVersion`, який вони не
 * розуміють — це дозволяє shell і web деплоїтись асинхронно без
 * взаємного crash-у.
 */
export const DEEP_LINK_PROTOCOL_VERSION = 1 as const;

export interface DeepLinkMessage {
  /** Версія wire-формату. Receiver ігнорує повідомлення з невідомим `protocolVersion`. */
  protocolVersion: typeof DEEP_LINK_PROTOCOL_VERSION;
  /**
   * Розпарсений path для React Router (`/finyk/transactions/123`,
   * `/auth/callback?token=…`). Без origin / scheme — sanitised на shell-side
   * через `parseDeepLink()` + `isSafeShellPath()`. Defensive recheck все
   * одно робиться у web-bridge через `isSafeNavPath()`.
   */
  url: string;
  /** Джерело події — поки що завжди `"shell"`, web→shell стрім не зарезервовано. */
  source: "shell" | "web";
  /**
   * `Date.now()` на момент відправлення. Web-bridge coalesce-ить дублі
   * queue + BroadcastChannel у вікні `COALESCE_WINDOW_MS`.
   */
  timestamp: number;
}

/** Type-guard: чи це валідна `DeepLinkMessage` (захист від випадкових messages у тому ж каналі). */
export function isDeepLinkMessage(value: unknown): value is DeepLinkMessage {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v["protocolVersion"] === DEEP_LINK_PROTOCOL_VERSION &&
    typeof v["url"] === "string" &&
    (v["source"] === "shell" || v["source"] === "web") &&
    typeof v["timestamp"] === "number"
  );
}

/**
 * Wrapper-обʼєкт над `BroadcastChannel`. Не використовує DOM напряму
 * (читає `globalThis.BroadcastChannel`), тому модуль безпечно імпортується
 * у будь-якому контексті — node, jsdom, web, Capacitor.
 *
 * Коли `BroadcastChannel` недоступний у глобалі — null-канал; shell
 * fallback-иться на pre-mount queue + `SHELL_DEEPLINK_QUEUE_EVENT`.
 */
export interface DeepLinkChannel {
  /**
   * Send a deep-link path. Returns `true` if the message was posted via
   * BroadcastChannel, `false` if the channel is a null-channel (legacy
   * fallback active).
   */
  post(payload: { url: string; source: DeepLinkMessage["source"] }): boolean;
  /**
   * Subscribe to incoming deep-link messages. Returns an unsubscribe
   * function. Messages with mismatched `protocolVersion` are silently
   * dropped before reaching the handler — log of unknown versions stays
   * out of hot path.
   */
  subscribe(handler: (msg: DeepLinkMessage) => void): () => void;
  /** Close the underlying BroadcastChannel and clear all subscriptions. */
  close(): void;
  /** `true` if a real BroadcastChannel is in use; `false` for null-channel. */
  readonly isOpen: boolean;
}

const NULL_CHANNEL: DeepLinkChannel = Object.freeze({
  post: (): boolean => false,
  subscribe: (): (() => void) => (): void => {
    // null-channel: nothing to unsubscribe
  },
  close: (): void => {
    // null-channel: nothing to close
  },
  isOpen: false,
});

export function createDeepLinkChannel(): DeepLinkChannel {
  // typeof guard плюс runtime feature-check — `BroadcastChannel` може
  // бути declared в TS-lib але throw-нути при new() у деяких WebView-ах.
  const BC: typeof BroadcastChannel | undefined = (
    globalThis as { BroadcastChannel?: typeof BroadcastChannel }
  ).BroadcastChannel;
  if (typeof BC !== "function") return NULL_CHANNEL;

  let channel: InstanceType<typeof BroadcastChannel>;
  try {
    channel = new BC(SHELL_DEEPLINK_CHANNEL);
  } catch {
    return NULL_CHANNEL;
  }

  const handlers = new Set<(msg: DeepLinkMessage) => void>();
  channel.onmessage = (ev: MessageEvent): void => {
    if (!isDeepLinkMessage(ev.data)) return;
    for (const h of handlers) {
      try {
        h(ev.data);
      } catch (err) {
        // Прибиваємо tab-isolating error від обробника, щоб не вбити
        // подальший delivery іншим listener-ам у тому ж процесі.
        console.warn("[shell-deep-link] subscriber threw", err);
      }
    }
  };

  return {
    post(payload): boolean {
      const message: DeepLinkMessage = {
        protocolVersion: DEEP_LINK_PROTOCOL_VERSION,
        url: payload.url,
        source: payload.source,
        timestamp: Date.now(),
      };
      try {
        channel.postMessage(message);
        return true;
      } catch (err) {
        console.warn("[shell-deep-link] postMessage failed", err);
        return false;
      }
    },
    subscribe(handler): () => void {
      handlers.add(handler);
      return (): void => {
        handlers.delete(handler);
      };
    },
    close(): void {
      handlers.clear();
      try {
        channel.close();
      } catch {
        // best-effort
      }
    },
    isOpen: true,
  };
}
