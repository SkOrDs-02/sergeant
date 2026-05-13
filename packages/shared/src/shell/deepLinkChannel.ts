/**
 * Cross-context bridge для shell-deep-link навігації — `apps/mobile-shell`
 * (Capacitor WebView script) надсилає, `apps/web/src/core/app/
 * ShellDeepLinkBridge.tsx` слухає. Реалізовано через стандартний
 * `BroadcastChannel` API (PR-29 у `docs/initiatives/stack-pulse-2026-05/
 * pr-29-shell-navigate-broadcast-channel.md`).
 *
 * Чому BroadcastChannel замість `window.__sergeantShellNavigate` global-у:
 *   1. Race-condition-free — persistent listener; повідомлення, надіслане
 *      ПЕРЕД маунтом React-bridge-у, не drop-иться доки в нас є
 *      pre-mount queue fallback на window-globalу.
 *   2. Testable — `BroadcastChannel` стандартизований у jsdom (через
 *      polyfill) і node 18+; не треба мокати глобальну функцію.
 *   3. Idiomatic — bridge не лишає global mutable state, який треба чистити
 *      при unmount-і HMR.
 *
 * Backward-compat: під час async deploy mobile-shell і web можуть бути на
 * різних версіях. PR-29 свідомо лишає `__sergeantShellNavigate` як alias
 * 3 місяці після ship-у (rollout PR-2 у тому ж spec-у), тому
 * `apps/mobile-shell/src/index.ts` ШЛЕ ОБОМА шляхами (BC + window-global),
 * а `ShellDeepLinkBridge.tsx` ЛИСТЕНИТЬ ОБИДВА з coalescing-вікном по
 * `(url, timestamp)` — щоб одна deep-link подія не призвела до двох
 * `navigate()` коли обидва шляхи живі.
 *
 * Fallback для старих WKWebView (<iOS 15.4) і Android System WebView без
 * BroadcastChannel: `createDeepLinkChannel()` повертає null-канал
 * (`post()` no-op, `subscribe()` no-op) і shell автоматично проходить
 * через legacy window-global path. Це навмисно — додатковий
 * `localStorage`-fallback (запропонований у spec) поки не потрібен, бо
 * Capacitor WebView вже мінімум iOS 14 / Android 7 з System WebView,
 * де native deep-link дисер shell-а просто викличе window-global.
 */

/** Назва BroadcastChannel — мусить збігатись на shell і web side. */
export const SHELL_DEEPLINK_CHANNEL = "sergeant-shell-deeplink";

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
   * `Date.now()` на момент відправлення. Використовується web-bridge-ом
   * для coalescing-вікна між BroadcastChannel і `window.__sergeantShellNavigate`
   * — щоб одна deep-link подія, надіслана обома шляхами, призводила до
   * рівно одного `navigate()`.
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
 * Коли `BroadcastChannel` недоступний у глобалі (`< iOS 15.4`, дуже старі
 * Android System WebView) — фабрика повертає null-канал: усі методи no-op,
 * `post()` повертає `false`. Caller (shell або web) має сам fallback-нутися
 * на window-global path. Це не баг, а свідоме design-рішення: не маскуємо
 * відсутність BC локальним localStorage, бо deep-link дисер у Capacitor
 * крутиться у тому ж main-thread browsing context, що й React, і window-
 * global працює без додаткового storage I/O.
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
