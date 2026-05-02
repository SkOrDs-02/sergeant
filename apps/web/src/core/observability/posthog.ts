import { getPlatform, isCapacitor } from "@sergeant/shared";

/**
 * Lazy PostHog transport for product analytics.
 *
 * Навмисно через динамічний `import()`, щоб SDK (~50 KB gzip) не потрапляв
 * у головний бандл — аналітика не повинна блокувати hydration (той самий
 * pattern, що й для Sentry у `sentry.ts`).
 *
 * Без `VITE_POSTHOG_KEY` — повний no-op: `posthog-js` не підтягується,
 * події продовжують логуватися тільки через `analytics.ts` localStorage
 * ring-buffer.
 *
 * Контракт:
 *   - `initPostHog()` — викликається один раз після hydration з
 *     `main.tsx` через `requestIdleCallback`. Ідемпотентний.
 *   - `capturePostHogEvent(name, payload)` — fire-and-forget. Події, які
 *     прилетіли ДО завершення init, буферизуються і flush-ються після.
 *   - `identifyPostHogUser(userId)` / `resetPostHog()` — після login /
 *     logout з `AuthContext`. Теж fire-and-forget, теж буферизуються.
 */

type PostHogLib = typeof import("posthog-js").default;

type QueuedCall =
  | { kind: "capture"; name: string; payload: Record<string, unknown> }
  | { kind: "identify"; userId: string; traits?: Record<string, unknown> }
  | { kind: "reset" };

let posthogModule: PostHogLib | null = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;
let queue: QueuedCall[] = [];

const MAX_QUEUE = 100;

function flushQueue() {
  if (!posthogModule) return;
  const drained = queue;
  queue = [];
  for (const call of drained) {
    try {
      if (call.kind === "capture") {
        posthogModule.capture(call.name, call.payload);
      } else if (call.kind === "identify") {
        posthogModule.identify(call.userId, call.traits);
      } else {
        posthogModule.reset();
      }
    } catch {
      /* noop — аналітика не повинна падати */
    }
  }
}

function enqueue(call: QueuedCall) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(call);
}

/**
 * Ініціалізує PostHog. Ідемпотентний — повторні виклики повертають той
 * самий promise. Якщо `VITE_POSTHOG_KEY` не виставлений — resolve без
 * завантаження SDK (no-op).
 */
export function initPostHog(): Promise<void> {
  if (initPromise) return initPromise;

  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    initPromise = Promise.resolve();
    return initPromise;
  }

  const host = import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

  initPromise = (async () => {
    try {
      const mod = await import("posthog-js");
      const posthog = mod.default;
      posthog.init(key, {
        api_host: host,
        // Explicit events only — не дублюємо з автокаптуром/пейджвʼю,
        // бо `trackEvent` вже покриває все, що нас цікавить, а payload
        // контролюється централізовано (без PII).
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        // Persist тільки для залогінених — анонімні відвідувачі не
        // створюють person profile у PostHog (лишає free-tier events).
        person_profiles: "identified_only",
        // Санітайзер: ніколи не шлемо cookies/session storage у events.
        sanitize_properties: (properties) => {
          const sanitized = { ...properties };
          delete sanitized["$cookies"];
          return sanitized;
        },
      });

      posthog.register({
        platform: getPlatform(),
        is_capacitor: isCapacitor(),
      });

      posthogModule = posthog;
      flushQueue();
    } catch {
      // SDK не завантажився — лишаємось у true no-op режимі. Події з
      // queue відкидаємо, а флаг `initFailed` блокує подальші enqueue,
      // щоб `capture/identify/reset` не churn-или shift() по MAX_QUEUE
      // до кінця сесії (див. огляд Devin Review на #972).
      initFailed = true;
      queue = [];
    }
  })();

  return initPromise;
}

/**
 * Fire-and-forget відправка події в PostHog. До завершення init
 * буферизує (до `MAX_QUEUE` подій). Якщо ENV не виставлений —
 * повний no-op.
 */
export function capturePostHogEvent(
  name: string,
  payload: Record<string, unknown> = {},
): void {
  if (!name) return;
  if (posthogModule) {
    try {
      posthogModule.capture(name, payload);
    } catch {
      /* noop */
    }
    return;
  }
  // Без VITE_POSTHOG_KEY initPromise resolve-иться без SDK, і якщо
  // динамічний `import()` впав — `initFailed === true`. У цих випадках
  // не буферизуємо: flushQueue ніхто вже не викличе, queue росла б
  // безцільно (навіть за умови bounded-shift у enqueue).
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  if (initFailed) return;
  enqueue({ kind: "capture", name, payload });
}

/**
 * Привʼязує всі наступні events до конкретного userId. Викликається з
 * `AuthContext` при переході у стан `authenticated`.
 */
export function identifyPostHogUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (!userId) return;
  if (posthogModule) {
    try {
      posthogModule.identify(userId, traits);
    } catch {
      /* noop */
    }
    return;
  }
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  if (initFailed) return;
  enqueue({ kind: "identify", userId, traits });
}

/**
 * Очищає distinctId і person properties — викликається при logout,
 * щоб наступна сесія не атрибутувалась попередньому юзеру.
 */
export function resetPostHog(): void {
  if (posthogModule) {
    try {
      posthogModule.reset();
    } catch {
      /* noop */
    }
    return;
  }
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  if (initFailed) return;
  enqueue({ kind: "reset" });
}

// Test-only: скидає внутрішній стан між тестами. Не експортується у
// публічному index — викликається напряму через `import("./posthog")`.
export function __resetForTests(): void {
  posthogModule = null;
  initPromise = null;
  initFailed = false;
  queue = [];
}
