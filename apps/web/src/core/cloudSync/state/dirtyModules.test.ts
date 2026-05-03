// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DIRTY_MODULES_KEY,
  MODULE_MODIFIED_KEY,
  SYNC_STATUS_EVENT,
} from "../config";
import {
  clearAllDirty,
  clearDirtyModule,
  getDirtyModules,
  getModuleModifiedTimes,
  markModuleDirty,
} from "./dirtyModules";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("markModuleDirty", () => {
  it("writes into DIRTY_MODULES_KEY and stamps MODULE_MODIFIED_KEY", () => {
    const before = Date.now();
    markModuleDirty("finyk");
    const after = Date.now();

    const dirty = getDirtyModules();
    expect(dirty).toEqual({ finyk: true });

    const modifiedTimes = getModuleModifiedTimes();
    expect(Object.keys(modifiedTimes)).toEqual(["finyk"]);
    const ts = Date.parse(modifiedTimes.finyk);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("accumulates entries across modules", () => {
    // PR #030 — fizruk is no longer a valid sync module. The pure
    // dirty-bookkeeping helpers don't validate against SYNC_MODULES,
    // but using the post-retirement set keeps the fixture honest.
    markModuleDirty("finyk");
    markModuleDirty("nutrition");
    expect(getDirtyModules()).toEqual({ finyk: true, nutrition: true });
    expect(Object.keys(getModuleModifiedTimes()).sort()).toEqual([
      "finyk",
      "nutrition",
    ]);
  });
});

describe("clearDirtyModule", () => {
  it("removes a single module from the dirty map but keeps its modified-time", () => {
    // clearDirtyModule only wipes dirty flags; modifiedTimes stay so that
    // an in-flight push can still diff against a snapshot after the single
    // module is cleared.
    markModuleDirty("finyk");
    markModuleDirty("nutrition");
    clearDirtyModule("finyk");
    expect(getDirtyModules()).toEqual({ nutrition: true });
    expect(Object.keys(getModuleModifiedTimes()).sort()).toEqual([
      "finyk",
      "nutrition",
    ]);
  });

  it("is a no-op for unknown modules", () => {
    markModuleDirty("finyk");
    clearDirtyModule("does-not-exist");
    expect(getDirtyModules()).toEqual({ finyk: true });
  });
});

describe("clearAllDirty", () => {
  it("resets BOTH dirty-flags and modified-times maps", () => {
    // Regression: previously only DIRTY_MODULES_KEY was reset, so the
    // modified-times map grew unbounded across every module ever dirtied
    // on the device.
    markModuleDirty("finyk");
    markModuleDirty("profile");
    markModuleDirty("nutrition");

    clearAllDirty();

    expect(getDirtyModules()).toEqual({});
    expect(getModuleModifiedTimes()).toEqual({});
    // And the raw storage is an empty object (not absent), which matches
    // the writer contract safeWriteLS expects everywhere.
    expect(localStorage.getItem(DIRTY_MODULES_KEY)).toBe("{}");
    expect(localStorage.getItem(MODULE_MODIFIED_KEY)).toBe("{}");
  });

  it("emits a status event so the sync indicator re-renders", () => {
    const handler = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, handler);
    try {
      markModuleDirty("finyk");
      handler.mockReset();
      clearAllDirty();
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, handler);
    }
  });

  it("is safe to call on a fresh install (no stored state)", () => {
    // Must not throw and must leave maps as empty objects.
    expect(() => clearAllDirty()).not.toThrow();
    expect(getDirtyModules()).toEqual({});
    expect(getModuleModifiedTimes()).toEqual({});
  });
});
