/**
 * PostHog transport for the Expo app — mobile parity for S0.3.
 *
 * Mirrors the API of `apps/web/src/core/observability/posthog.ts` so
 * call-sites (`trackEvent`, auth-context bridge) stay identical across
 * platforms. The web side uses lazy `import("posthog-js")`; here we
 * post directly to PostHog's public capture endpoint via `fetch`.
 *
 * Why no `posthog-react-native` dep:
 *   - Capture is the only surface we need today (no autocapture, no
 *     session replay, no surveys). The HTTP `/capture/` endpoint
 *     covers `event` / `$identify` / `$set` cleanly.
 *   - Keeps the mobile bundle smaller and avoids pulling in a new
 *     native module on top of the existing observability stack.
 *
 * Без `EXPO_PUBLIC_POSTHOG_KEY` — повний no-op: `fetch` не викликається,
 * події живуть тільки у локальному `console.log` всередині
 * `analytics.ts`. Поведінка симетрична web-варіанту під відсутній
 * `VITE_POSTHOG_KEY`.
 *
 * Контракт:
 *   - `initPostHog()` — викликається один раз з `app/_layout.tsx`
 *     після монтування. Ідемпотентний.
 *   - `capturePostHogEvent(name, payload)` — fire-and-forget. Події
 *     до завершення init буферизуються (до `MAX_QUEUE`), після —
 *     летять напряму у `fetch`.
 *   - `identifyPostHogUser(userId, traits)` / `resetPostHog()` —
 *     після login / sign-out з `AnalyticsIdentityBridge`.
 */

import { Platform } from "react-native";

import { mobileKVStore } from "@/lib/storage";

import { getPostHogHost, getPostHogKey } from "./posthogEnv";

/** MMKV key under which the persisted anonymous distinct_id lives. */
const DISTINCT_ID_KEY = "sergeant.mobile.posthog.distinct_id.v1";

const MAX_QUEUE = 100;

type CaptureProperties = Record<string, unknown>;

type QueuedCall =
  | { kind: "capture"; name: string; payload: CaptureProperties }
  | { kind: "identify"; userId: string; traits?: CaptureProperties }
  | { kind: "reset" };

interface PostHogState {
  apiKey: string;
  apiHost: string;
  /** Active distinct_id — anonymous UUID until `identify`, then user id. */
  distinctId: string;
  /** Last `identify` traits, re-merged into every capture as `$set`. */
  traits: CaptureProperties | null;
}

let state: PostHogState | null = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;
let queue: QueuedCall[] = [];

function safeRandomId(): string {
  // Cheap RFC4122-shape random id. Crypto strength is irrelevant —
  // PostHog only uses distinct_id as an opaque bucket.
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i += 1) out += hex[Math.floor(Math.random() * 16)];
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

function loadOrCreateAnonId(): string {
  try {
    const cached = mobileKVStore.getString(DISTINCT_ID_KEY);
    if (cached && cached.length > 0) return cached;
  } catch {
    /* fall through to fresh id */
  }
  const fresh = safeRandomId();
  try {
    mobileKVStore.setString(DISTINCT_ID_KEY, fresh);
  } catch {
    /* MMKV unavailable in cold-start; in-memory id still works for the session */
  }
  return fresh;
}

function persistDistinctId(id: string): void {
  try {
    mobileKVStore.setString(DISTINCT_ID_KEY, id);
  } catch {
    /* noop — analytics must never throw */
  }
}

function flushQueue(): void {
  if (!state) return;
  const drained = queue;
  queue = [];
  for (const call of drained) {
    if (call.kind === "capture") {
      void postCapture(call.name, call.payload);
    } else if (call.kind === "identify") {
      void postIdentify(call.userId, call.traits);
    } else {
      handleReset();
    }
  }
}

function enqueue(call: QueuedCall): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(call);
}

/**
 * Build the `properties` payload merged into every `/capture/` POST.
 * Mirrors web's `posthog.register({ platform, is_capacitor })` plus an
 * `is_expo` flag so funnels can split mobile-Expo from web-Capacitor
 * without inspecting `platform` alone.
 */
function buildSuperProperties(): CaptureProperties {
  return {
    platform: Platform.OS,
    is_capacitor: false,
    is_expo: true,
  };
}

async function postCapture(
  eventName: string,
  payload: CaptureProperties,
): Promise<void> {
  if (!state) return;
  const properties: CaptureProperties = {
    ...buildSuperProperties(),
    ...payload,
  };
  if (state.traits) {
    // PostHog convention: `$set` on a capture event updates person
    // properties without requiring a separate `$identify` per call.
    properties.$set = state.traits;
  }
  const body = JSON.stringify({
    api_key: state.apiKey,
    distinct_id: state.distinctId,
    event: eventName,
    properties,
    timestamp: new Date().toISOString(),
  });
  try {
    await fetch(`${state.apiHost.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    /* analytics must never break the host app */
  }
}

async function postIdentify(
  userId: string,
  traits?: CaptureProperties,
): Promise<void> {
  if (!state) return;
  const previousId = state.distinctId;
  state.distinctId = userId;
  state.traits = traits ?? null;
  persistDistinctId(userId);
  const properties: CaptureProperties = {
    ...buildSuperProperties(),
    $set: traits ?? {},
  };
  // PostHog's $identify also accepts $anon_distinct_id to stitch the
  // pre-login session to the authenticated user, matching web's
  // `posthog.identify` behaviour.
  if (previousId && previousId !== userId) {
    properties.$anon_distinct_id = previousId;
  }
  const body = JSON.stringify({
    api_key: state.apiKey,
    distinct_id: userId,
    event: "$identify",
    properties,
    timestamp: new Date().toISOString(),
  });
  try {
    await fetch(`${state.apiHost.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    /* noop */
  }
}

function handleReset(): void {
  if (!state) return;
  // Re-roll anonymous distinct_id so events emitted post-logout are
  // not attributed to the previous user. Persist immediately so a
  // crash before the next event still picks up the fresh id.
  const fresh = safeRandomId();
  state.distinctId = fresh;
  state.traits = null;
  persistDistinctId(fresh);
}

/**
 * Initialises the PostHog transport. Idempotent — repeated calls
 * return the same promise. Without `EXPO_PUBLIC_POSTHOG_KEY` this
 * resolves to a no-op without ever issuing a `fetch`.
 */
export function initPostHog(): Promise<void> {
  if (initPromise) return initPromise;
  const key = getPostHogKey();
  if (!key) {
    initPromise = Promise.resolve();
    return initPromise;
  }
  initPromise = (async () => {
    try {
      state = {
        apiKey: key,
        apiHost: getPostHogHost(),
        distinctId: loadOrCreateAnonId(),
        traits: null,
      };
      flushQueue();
    } catch {
      // Should not happen — `loadOrCreateAnonId` already swallows
      // MMKV failures — but mirror web's `initFailed` guard so the
      // queue can't grow unbounded in pathological environments.
      initFailed = true;
      queue = [];
    }
  })();
  return initPromise;
}

/**
 * Fire-and-forget capture. До завершення init буферизує (до
 * `MAX_QUEUE`). Якщо ENV не виставлений — повний no-op.
 */
export function capturePostHogEvent(
  name: string,
  payload: CaptureProperties = {},
): void {
  if (!name) return;
  if (state) {
    void postCapture(name, payload);
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "capture", name, payload });
}

/**
 * Привʼязує всі наступні events до конкретного userId. Викликається з
 * `AnalyticsIdentityBridge` коли `useUser()` повертає активний user.
 */
export function identifyPostHogUser(
  userId: string,
  traits?: CaptureProperties,
): void {
  if (!userId) return;
  if (state) {
    void postIdentify(userId, traits);
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "identify", userId, traits });
}

/**
 * Очищає distinct_id і person traits — викликається при logout, щоб
 * наступна сесія не атрибутувалась попередньому юзеру.
 */
export function resetPostHog(): void {
  if (state) {
    handleReset();
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "reset" });
}

/** Test-only: reset module-scope state between specs. */
export function __resetPostHogForTests(): void {
  state = null;
  initPromise = null;
  initFailed = false;
  queue = [];
}
