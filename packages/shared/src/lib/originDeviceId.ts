/**
 * Origin-device-id resolver — pure helper used by the web and mobile
 * sync-engine singletons to produce a stable per-install identifier
 * that is forwarded as `X-Origin-Device-Id` on every sync v2 request.
 *
 * Why this exists:
 *
 *   Before this helper, both client singletons constructed
 *   `createSyncEngineWriterRuntime({ ... })` *without* an
 *   `originDeviceId` field. The runtime → scheduler → pushLoop chain
 *   only attaches the header when `options.originDeviceId !== undefined`
 *   (`packages/api-client/src/endpoints/syncV2.pushLoop.ts`). The server
 *   therefore inserted every applied op into `sync_op_log` with
 *   `origin_device_id = NULL` (`apps/server/src/modules/sync/syncV2.ts`).
 *   The pull/SSE filter is `WHERE origin_device_id IS DISTINCT FROM $3`;
 *   PG semantics make `NULL IS DISTINCT FROM NULL` evaluate to `FALSE`,
 *   so every NULL-origin row was silently excluded from every
 *   NULL-header pull — multi-device convergence was broken-by-construction
 *   the moment `pullV2` is wired.
 *
 * Contract:
 *
 *   - The resolver reads `STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID` from the
 *     supplied {@link KVStore} adapter. If the slot already holds a
 *     non-empty, ≤64-char string, that value is returned verbatim.
 *   - Otherwise a fresh ID is minted via the injected `randomUUID`
 *     callable (typically `globalThis.crypto?.randomUUID` with a string
 *     fallback) and persisted before being returned.
 *   - The helper is intentionally synchronous: it must complete before
 *     the writer-runtime is constructed, so callers cannot await
 *     asynchronous SQLite warm-cache hydration here. That is why the
 *     web wrapper passes `webKVStore` (which transparently falls back
 *     to `localStorage` before the SQLite warm-cache is ready) and the
 *     mobile wrapper passes `mobileKVStore` (MMKV — also synchronous).
 *   - Reads through `KVStore.getString` never throw (see
 *     `packages/shared/src/storage/kv.ts`); writes through `setString`
 *     are also best-effort. A storage failure therefore degrades to a
 *     fresh ID being generated per boot — the server will still
 *     consider the device distinct from itself across reloads, but the
 *     consistency invariant (NULL → no convergence) is preserved.
 *
 * @see packages/api-client/src/endpoints/syncV2.pushScheduler.ts
 * @see apps/server/src/modules/sync/syncV2.ts (readOriginDeviceId,
 *      pull filter, SSE stream filter)
 */
import type { KVStore } from "../storage/kv";

import { STORAGE_KEYS } from "./storageKeys";

/**
 * Server-side trimming clamps `X-Origin-Device-Id` to 64 chars and
 * collapses whitespace-only headers to `null`. Mirroring the bound
 * client-side keeps the round-trip stable so the server-side
 * own-write echo suppression always compares against the exact value
 * that was emitted.
 *
 * @see apps/server/src/modules/sync/syncV2.ts (readOriginDeviceId)
 */
export const ORIGIN_DEVICE_ID_MAX_LENGTH = 64;

/**
 * Strip surrounding whitespace and truncate to {@link
 * ORIGIN_DEVICE_ID_MAX_LENGTH} chars. Returns `null` for empty input.
 */
export function normalizeOriginDeviceId(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > ORIGIN_DEVICE_ID_MAX_LENGTH
    ? trimmed.slice(0, ORIGIN_DEVICE_ID_MAX_LENGTH)
    : trimmed;
}

export interface ResolveOriginDeviceIdDeps {
  /** Per-platform KVStore adapter — `webKVStore` or `mobileKVStore`. */
  readonly store: Pick<KVStore, "getString" | "setString">;
  /**
   * Fresh-ID factory. Defaults to `globalThis.crypto.randomUUID()` with a
   * `getRandomValues` UUID fallback when `randomUUID` is unavailable.
   * Injectable so unit tests can pin the value.
   */
  readonly randomUUID?: () => string;
}

/**
 * UUID v4 fallback for runtimes that expose Web Crypto but not `randomUUID`.
 */
export function fallbackRandomId(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Web Crypto is required to generate an origin device ID");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function defaultRandomUUID(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return fallbackRandomId();
}

/**
 * Read the persisted origin-device-id from the supplied KVStore, or
 * mint and persist a fresh one. Always returns a non-empty,
 * ≤{@link ORIGIN_DEVICE_ID_MAX_LENGTH}-char string.
 *
 * Storage layout: a single string under
 * {@link STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID}. No JSON envelope — the
 * value is stored verbatim so it can be inspected and reset by hand
 * from devtools / MMKV inspector if needed.
 */
export function resolveOriginDeviceId(deps: ResolveOriginDeviceIdDeps): string {
  const { store, randomUUID = defaultRandomUUID } = deps;
  const existing = normalizeOriginDeviceId(
    store.getString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID),
  );
  if (existing !== null) return existing;
  const minted = normalizeOriginDeviceId(randomUUID()) ?? fallbackRandomId();
  store.setString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID, minted);
  return minted;
}
