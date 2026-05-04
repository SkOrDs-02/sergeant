/**
 * PostHog transport for the Expo mobile bundle.
 *
 * Mirrors the contract of `apps/web/src/core/observability/posthog.ts`
 * so call-sites stay symmetric across platforms:
 *
 *   - `initPostHog()` — call once after storage bootstrap from
 *     `app/_layout.tsx`. Idempotent. Restores the persisted distinct
 *     id (or mints a new one) and registers `source: "mobile-expo"` +
 *     `platform` super-properties.
 *   - `capturePostHogEvent(name, payload)` — fire-and-forget. Events
 *     fired before init complete are buffered (bounded queue) and
 *     flushed once init resolves.
 *   - `identifyPostHogUser(userId, traits)` / `resetPostHog()` — wired
 *     from the auth-watching `<IdentityBridge/>` so logged-in users
 *     attach to a stable `distinct_id`.
 *
 * Why HTTP instead of `posthog-react-native`:
 *   The official RN SDK pulls in `expo-application`, `expo-device`,
 *   `expo-localization`, `react-native-device-info`, … as peer deps —
 *   most of which are not yet in `apps/mobile/package.json` and would
 *   require config-plugin work + `expo prebuild`. We only need the
 *   capture / identify / reset surface for the FTUX activation funnel
 *   (see `docs/launch/ftux-sprint-plan.md` §S0.3), so a minimal
 *   `fetch`-based client keeps the dependency surface tight and works
 *   in both Expo Go and dev-client builds.
 *
 * Without `EXPO_PUBLIC_POSTHOG_KEY` the module is a complete no-op:
 *   no network requests, no MMKV writes, no buffered queue.
 */

import { Platform } from "react-native";
import * as Crypto from "expo-crypto";

import { safeReadStringLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";

import { getPostHogHost, getPostHogKey } from "./env";

type QueuedCall =
  | { kind: "capture"; name: string; payload: Record<string, unknown> }
  | { kind: "identify"; userId: string; traits?: Record<string, unknown> }
  | { kind: "reset" };

const DISTINCT_ID_KEY = "posthog_distinct_id_v1";
const MAX_QUEUE = 100;

let initPromise: Promise<void> | null = null;
let initialized = false;
let initFailed = false;
let distinctId: string | null = null;
let projectKey: string | null = null;
let apiHost: string | null = null;
let superProperties: Record<string, unknown> = {};
let queue: QueuedCall[] = [];

function readPersistedDistinctId(): string | null {
  return safeReadStringLS(DISTINCT_ID_KEY, null);
}

function persistDistinctId(value: string): void {
  try {
    safeWriteLS(DISTINCT_ID_KEY, value);
  } catch {
    /* noop — analytics must never break the host app */
  }
}

function clearPersistedDistinctId(): void {
  try {
    safeRemoveLS(DISTINCT_ID_KEY);
  } catch {
    /* noop */
  }
}

function newAnonymousId(): string {
  // `expo-crypto` is already a transitive runtime dep (used by
  // `storageEncryption`), so we lean on its CSPRNG-backed `randomUUID`.
  // The id is ephemeral until the user logs in and `identifyPostHogUser`
  // overwrites it with the server-assigned user id.
  try {
    return Crypto.randomUUID();
  } catch {
    return `anon_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }
}

async function postEvent(
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  if (!projectKey || !apiHost || !distinctId) return;
  try {
    await fetch(`${apiHost}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: projectKey,
        event,
        distinct_id: distinctId,
        properties: {
          ...superProperties,
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    /* noop — fire-and-forget; offline / network failures must not surface */
  }
}

function flushQueue(): void {
  const drained = queue;
  queue = [];
  for (const call of drained) {
    try {
      if (call.kind === "capture") {
        void postEvent(call.name, call.payload);
      } else if (call.kind === "identify") {
        runIdentify(call.userId, call.traits);
      } else {
        runReset();
      }
    } catch {
      /* noop */
    }
  }
}

function enqueue(call: QueuedCall): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(call);
}

function runIdentify(userId: string, traits?: Record<string, unknown>): void {
  if (!projectKey || !apiHost) return;
  distinctId = userId;
  persistDistinctId(userId);
  void postEvent("$identify", {
    $set: traits ?? {},
  });
}

function runReset(): void {
  if (!projectKey || !apiHost) return;
  distinctId = newAnonymousId();
  clearPersistedDistinctId();
}

/**
 * Initialise the PostHog transport. Idempotent — repeat calls return
 * the same promise. When `EXPO_PUBLIC_POSTHOG_KEY` is missing the
 * function resolves to a complete no-op (no network, no storage writes,
 * `capture`/`identify`/`reset` are silently dropped).
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
      projectKey = key;
      apiHost = getPostHogHost();

      const persisted = readPersistedDistinctId();
      if (persisted) {
        distinctId = persisted;
      } else {
        distinctId = newAnonymousId();
        persistDistinctId(distinctId);
      }

      // `source` distinguishes mobile-Expo events from web (`undefined`
      // / "web") and Capacitor-shell builds — see web posthog.ts which
      // registers `platform` + `is_capacitor` super-properties for those.
      superProperties = {
        source: "mobile-expo",
        platform: Platform.OS,
      };

      initialized = true;
      flushQueue();
    } catch {
      initFailed = true;
      queue = [];
    }
  })();

  return initPromise;
}

/**
 * Fire-and-forget product event. Buffered until `initPostHog` resolves;
 * complete no-op when the SDK was never initialised (missing key).
 */
export function capturePostHogEvent(
  name: string,
  payload: Record<string, unknown> = {},
): void {
  if (!name) return;
  if (initialized) {
    void postEvent(name, payload);
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "capture", name, payload });
}

/**
 * Bind every subsequent event to a known `userId`. Persisted across
 * app restarts via MMKV so cold-start events keep landing on the same
 * person profile until `resetPostHog` is called (logout).
 */
export function identifyPostHogUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (!userId) return;
  if (initialized) {
    runIdentify(userId, traits);
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "identify", userId, traits });
}

/**
 * Drop the current `distinct_id` and mint a fresh anonymous one — the
 * mobile equivalent of `posthog.reset()` on web. Called from the auth
 * bridge when `useUser()` flips back to logged-out.
 */
export function resetPostHog(): void {
  if (initialized) {
    runReset();
    return;
  }
  if (!getPostHogKey()) return;
  if (initFailed) return;
  enqueue({ kind: "reset" });
}

// Test-only: resets the module state between tests. Not exported from
// the public index — call directly via `import("./posthog")`.
export function __resetForTests(): void {
  initPromise = null;
  initialized = false;
  initFailed = false;
  distinctId = null;
  projectKey = null;
  apiHost = null;
  superProperties = {};
  queue = [];
}
