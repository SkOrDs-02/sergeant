// @vitest-environment jsdom
/**
 * Behavioral tests for useCloudSync module.
 *
 * Until PR #008 the module patched `globalThis.localStorage` at import
 * time so that writes to tracked keys would automatically mark the
 * corresponding sync module dirty and dispatch
 * `SYNC_EVENT`/`SYNC_STATUS_EVENT`. PR #008 dropped the patch — the
 * dirty-marking plumbing is now reached through the explicit
 * `syncedKV` wrapper (see
 * `apps/web/src/shared/lib/storage/syncedKV.ts`) or, for callers that
 * mutate state through other means, through the public
 * `notifySyncDirty(key)` helper. These tests exercise the pure
 * exports (`getDirtyModules`, `getOfflineQueue`, `notifySyncDirty`)
 * plus the dirty-tracking codepath through `notifySyncDirty`, which
 * shares its `markModuleDirty` core with the syncedKV write path.
 *
 * We do NOT test the `useCloudSync` React hook itself here — that
 * would require @testing-library/react plus network mocks. The
 * business-critical logic the hook delegates to (collect/apply/push
 * flow, offline queue) is covered in `cloudSyncHelpers.test.js` and
 * the engine-level tests in `engine/__tests__`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDirtyModules,
  getOfflineQueue,
  notifySyncDirty,
  SYNC_EVENT,
  SYNC_STATUS_EVENT,
} from "./useCloudSync";
import { __resetOfflineQueueCacheForTests } from "./queue/offlineQueue";
import { STORAGE_KEYS } from "@sergeant/shared";

beforeEach(() => {
  // Clear all tracked state. Use the patched setItem/removeItem so behavior
  // is realistic, but also raw clear() for meta keys.
  localStorage.clear();
  // PR #009 — the offline queue now lives in an in-memory cache backed
  // by IDB; LS is best-effort. Reset the cache between tests so a queue
  // populated by an earlier test doesn't bleed into the next one.
  __resetOfflineQueueCacheForTests();
});
afterEach(() => {
  localStorage.clear();
  __resetOfflineQueueCacheForTests();
});

describe("getDirtyModules", () => {
  it("повертає {} коли нічого не збережено", () => {
    expect(getDirtyModules()).toEqual({});
  });
  it("читає збережену мапу dirty модулів", () => {
    localStorage.setItem(
      STORAGE_KEYS.SYNC_DIRTY_MODULES,
      JSON.stringify({ profile: true }),
    );
    expect(getDirtyModules()).toEqual({ profile: true });
  });
  it("повертає {} коли значення пошкоджене JSON", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{not-json");
    expect(getDirtyModules()).toEqual({});
  });
});

describe("getOfflineQueue", () => {
  it("повертає [] коли нічого не збережено", () => {
    expect(getOfflineQueue()).toEqual([]);
  });
  it("повертає збережену чергу", () => {
    const q = [{ type: "push", modules: { profile: { data: {} } } }];
    localStorage.setItem(STORAGE_KEYS.SYNC_OFFLINE_QUEUE, JSON.stringify(q));
    expect(getOfflineQueue()).toHaveLength(1);
  });
  it("повертає [] коли значення — не масив", () => {
    localStorage.setItem(
      STORAGE_KEYS.SYNC_OFFLINE_QUEUE,
      JSON.stringify({ bad: true }),
    );
    expect(getOfflineQueue()).toEqual([]);
  });
});

// NOTE: PR #008 dropped the historical `localStorage.setItem` monkey-patch
// in favor of the explicit `syncedKV` wrapper. The dirty-tracking
// codepath is now reached through `notifySyncDirty` (called below) and
// through `safeWriteSyncedLS` (covered in
// `apps/web/src/shared/lib/storage/syncedKV.test.ts`). Both share the
// same internal `markModuleDirty`.

describe("notifySyncDirty", () => {
  it("для tracked ключа USER_PROFILE позначає модуль profile брудним", () => {
    // PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR
    // #039 retired `finyk` from SYNC_MODULES (storage-roadmap Stage
    // 4); only `profile` (USER_PROFILE) remains as a tracked key.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.USER_PROFILE);
    expect(getDirtyModules().profile).toBe(true);
  });

  it("для ретиреного fizruk ключа не маркує жоден модуль брудним (PR #030)", () => {
    // PR #030 (storage-roadmap Stage 4) — `fizruk` retired from
    // SYNC_MODULES. Writes to legacy `fizruk_*_v1` LS keys are now
    // untracked, so notifySyncDirty must NOT mark anything dirty.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.FIZRUK_WORKOUTS);
    notifySyncDirty(STORAGE_KEYS.FIZRUK_DAILY_LOG);
    expect(getDirtyModules()).toEqual({});
  });

  it("для ретиреного nutrition ключа не маркує жоден модуль брудним (PR #034)", () => {
    // PR #034 (storage-roadmap Stage 4) — `nutrition` retired from
    // SYNC_MODULES. Writes to legacy `nutrition_*_v1` LS keys are now
    // untracked, so notifySyncDirty must NOT mark anything dirty.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.NUTRITION_LOG);
    notifySyncDirty(STORAGE_KEYS.NUTRITION_PANTRIES);
    expect(getDirtyModules()).toEqual({});
  });

  it("для ретиреного finyk ключа не маркує жоден модуль брудним (PR #039)", () => {
    // PR #039 (storage-roadmap Stage 4) — `finyk` retired from
    // SYNC_MODULES. Writes to legacy `finyk_*` LS keys are now
    // untracked, so notifySyncDirty must NOT mark anything dirty.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
    notifySyncDirty(STORAGE_KEYS.FINYK_SUBS);
    notifySyncDirty(STORAGE_KEYS.FINYK_TX_CACHE);
    expect(getDirtyModules()).toEqual({});
  });

  it("notifySyncDirty також зберігає MODULE_MODIFIED ISO час", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    localStorage.removeItem(STORAGE_KEYS.SYNC_MODULE_MODIFIED);
    notifySyncDirty(STORAGE_KEYS.USER_PROFILE);
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_MODULE_MODIFIED);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.profile).toBeTruthy();
    expect(new Date(parsed.profile).toISOString()).toBe(parsed.profile);
  });

  it("декілька викликів для різних ключів profile реєструють той же модуль", () => {
    // PR #039: `profile` (USER_PROFILE) is the only currently
    // tracked module. Writes to retired keys do NOT mark dirty.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.USER_PROFILE);
    notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
    const d = getDirtyModules();
    expect(Object.keys(d).sort()).toEqual(["profile"]);
  });

  it("диспатчить SYNC_STATUS_EVENT для tracked ключа", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      notifySyncDirty(STORAGE_KEYS.USER_PROFILE);
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, listener);
    }
  });
});

describe("notifySyncDirty edge cases", () => {
  it("для tracked ключа позначає відповідний модуль брудним", () => {
    // Reset dirty state
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.USER_PROFILE);
    expect(getDirtyModules().profile).toBe(true);
  });

  it("для untracked ключа не мутує dirty мапу", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty("some_untracked_key");
    expect(getDirtyModules()).toEqual({});
  });

  it("для undefined ключа не падає і нічого не маркує", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    expect(() => notifySyncDirty()).not.toThrow();
    expect(getDirtyModules()).toEqual({});
  });

  it("завжди диспатчить SYNC_EVENT (навіть для untracked)", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_EVENT, listener);
    try {
      notifySyncDirty("any_key");
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener(SYNC_EVENT, listener);
    }
  });
});
