// @vitest-environment jsdom
/**
 * Behavioral tests for useCloudSync module.
 *
 * The module patches globalThis.localStorage at import time so that writes to
 * tracked keys automatically mark the corresponding sync module dirty and
 * dispatch SYNC_EVENT / SYNC_STATUS_EVENT. These tests exercise that plumbing
 * as well as the pure exports (getDirtyModules, getOfflineQueue,
 * notifySyncDirty).
 *
 * We do NOT test the `useCloudSync` React hook itself here — that would
 * require @testing-library/react plus network mocks. The business-critical
 * logic the hook delegates to (collect/apply/push-flow, offline queue) is
 * covered in cloudSyncHelpers.test.js or below via pure function flows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDirtyModules,
  getOfflineQueue,
  notifySyncDirty,
  SYNC_EVENT,
  SYNC_STATUS_EVENT,
} from "./useCloudSync";
import { STORAGE_KEYS } from "@sergeant/shared";

beforeEach(() => {
  // Clear all tracked state. Use the patched setItem/removeItem so behavior
  // is realistic, but also raw clear() for meta keys.
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("getDirtyModules", () => {
  it("повертає {} коли нічого не збережено", () => {
    expect(getDirtyModules()).toEqual({});
  });
  it("читає збережену мапу dirty модулів", () => {
    localStorage.setItem(
      STORAGE_KEYS.SYNC_DIRTY_MODULES,
      JSON.stringify({ finyk: true }),
    );
    expect(getDirtyModules()).toEqual({ finyk: true });
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
    const q = [{ type: "push", modules: { finyk: { data: {} } } }];
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

// NOTE: The module also patches localStorage.setItem/removeItem at import time
// to auto-mark dirty modules on writes to tracked keys. That patching works in
// production browsers but cannot be tested in jsdom (Storage methods can't be
// shadowed as own properties in jsdom's implementation). The equivalent dirty-
// tracking codepath is exercised via notifySyncDirty below, which calls the
// same internal markModuleDirty.

describe("notifySyncDirty", () => {
  it("для tracked ключа finyk позначає модуль finyk брудним", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
    expect(getDirtyModules().finyk).toBe(true);
  });

  it("для tracked ключа fizruk позначає модуль fizruk брудним", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.FIZRUK_WORKOUTS);
    expect(getDirtyModules().fizruk).toBe(true);
  });

  it("для tracked ключа nutrition позначає модуль nutrition брудним", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.NUTRITION_LOG);
    expect(getDirtyModules().nutrition).toBe(true);
  });

  it("notifySyncDirty також зберігає MODULE_MODIFIED ISO час", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    localStorage.removeItem(STORAGE_KEYS.SYNC_MODULE_MODIFIED);
    notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_MODULE_MODIFIED);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.finyk).toBeTruthy();
    expect(new Date(parsed.finyk).toISOString()).toBe(parsed.finyk);
  });

  it("декілька викликів для різних модулів накопичуються в dirty map", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");
    notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
    notifySyncDirty(STORAGE_KEYS.ROUTINE);
    notifySyncDirty(STORAGE_KEYS.NUTRITION_LOG);
    const d = getDirtyModules();
    expect(Object.keys(d).sort()).toEqual(["finyk", "nutrition", "routine"]);
  });

  it("диспатчить SYNC_STATUS_EVENT для tracked ключа", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      notifySyncDirty(STORAGE_KEYS.FINYK_BUDGETS);
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
    notifySyncDirty(STORAGE_KEYS.ROUTINE);
    expect(getDirtyModules().routine).toBe(true);
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
