// @vitest-environment jsdom
/**
 * Regression tests for the cloud-sync hardening quick wins:
 *   - offline queue coalescing + size cap
 *   - tolerant replay (skips corrupted entries, doesn't crash)
 *   - strict per-module success check (no silent drops on partial fail)
 *   - invalid-date defense in conflict resolution
 *
 * These tests cover the pure helpers that the hook delegates to. The React
 * hook itself is exercised in useCloudSync.behavior.test.js via events; the
 * async network flows are covered here at the helper level because jsdom
 * can't reliably stub fetch across module boundaries.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getOfflineQueue,
  __internal_isModulePushSuccess as isOk,
  __internal_collectQueuedModules as collectQueued,
  __internal_addToOfflineQueue as enqueue,
  __internal_parseDateSafe as parseDate,
} from "./useCloudSync";
import { STORAGE_KEYS } from "@sergeant/shared";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("isModulePushSuccess", () => {
  it("treats missing/non-object result as failure", () => {
    expect(isOk(null)).toBe(false);
    expect(isOk(undefined)).toBe(false);
    expect(isOk("ok")).toBe(false);
    expect(isOk(0)).toBe(false);
  });

  it("treats explicit conflict as failure", () => {
    expect(isOk({ conflict: true, version: 5 })).toBe(false);
  });

  it("treats explicit error as failure", () => {
    expect(isOk({ error: "boom" })).toBe(false);
  });

  it("treats ok:false as failure", () => {
    expect(isOk({ ok: false, version: 3 })).toBe(false);
  });

  it("treats a version-only result as success", () => {
    expect(isOk({ version: 3 })).toBe(true);
  });

  it("treats empty object as success (server accepted)", () => {
    expect(isOk({})).toBe(true);
  });
});

describe("parseDateSafe", () => {
  it("returns null for empty/nullish", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("2024-13-40T99:99:99Z")).toBeNull();
  });

  it("returns a Date for valid ISO strings", () => {
    const d = parseDate("2024-01-15T10:30:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2024-01-15T10:30:00.000Z");
  });
});

describe("collectQueuedModules (corruption tolerance)", () => {
  it("returns {} for non-array input", () => {
    expect(collectQueued(null)).toEqual({});
    expect(collectQueued(undefined)).toEqual({});
    expect(collectQueued("bad")).toEqual({});
    expect(collectQueued({ not: "array" })).toEqual({});
  });

  it("skips entries that are not objects", () => {
    const q = [null, "string", 42, { type: "push", modules: {} }];
    expect(collectQueued(q)).toEqual({});
  });

  it("skips entries with wrong type", () => {
    const q = [
      { type: "pull", modules: { finyk: { data: {} } } },
      { type: "unknown", modules: { fizruk: { data: {} } } },
    ];
    expect(collectQueued(q)).toEqual({});
  });

  it("skips entries with missing/non-object modules", () => {
    const q = [
      { type: "push" },
      { type: "push", modules: null },
      { type: "push", modules: "oops" },
    ];
    expect(collectQueued(q)).toEqual({});
  });

  it("skips unknown module names", () => {
    const q = [
      {
        type: "push",
        modules: {
          not_a_real_module: { data: { foo: "bar" } },
          finyk: { data: { x: 1 } },
        },
      },
    ];
    const out = collectQueued(q);
    expect(out).toHaveProperty("finyk");
    expect(out).not.toHaveProperty("not_a_real_module");
  });

  it("later entries overwrite earlier ones for the same module", () => {
    const q = [
      { type: "push", modules: { finyk: { data: { v: 1 } } } },
      { type: "push", modules: { finyk: { data: { v: 2 } } } },
    ];
    expect(collectQueued(q)).toEqual({ finyk: { data: { v: 2 } } });
  });

  it("merges payloads across modules from multiple entries", () => {
    // PR #026 видалив 'routine' з SYNC_MODULES (тепер SQLite-only),
    // тому беремо 'profile' як третій валідний модуль.
    const q = [
      { type: "push", modules: { finyk: { data: { a: 1 } } } },
      { type: "push", modules: { fizruk: { data: { b: 2 } } } },
      { type: "push", modules: { profile: { data: { c: 3 } } } },
    ];
    expect(Object.keys(collectQueued(q)).sort()).toEqual([
      "finyk",
      "fizruk",
      "profile",
    ]);
  });
});

describe("addToOfflineQueue coalescing", () => {
  it("merges consecutive push entries into the last row", () => {
    enqueue({ type: "push", modules: { finyk: { data: { v: 1 } } } } as never);
    enqueue({ type: "push", modules: { fizruk: { data: { v: 2 } } } } as never);
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(Object.keys(q[0].modules).sort()).toEqual(["finyk", "fizruk"]);
  });

  it("later merged module payload overwrites earlier one", () => {
    enqueue({ type: "push", modules: { finyk: { data: { v: 1 } } } } as never);
    enqueue({ type: "push", modules: { finyk: { data: { v: 2 } } } } as never);
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.finyk.data.v).toBe(2);
  });

  it("caps queue length when many non-coalescing entries accumulate", () => {
    // Force non-push entries that don't coalesce so we can exercise the cap.
    for (let i = 0; i < 120; i++) {
      enqueue({ type: `other-${i}`, payload: i } as never);
    }
    const q = getOfflineQueue();
    expect(q.length).toBeLessThanOrEqual(50);
    // Oldest entries should be dropped, newest preserved.
    const last = q[q.length - 1];
    expect(last.type).toBe("other-119");
  });

  it("does not coalesce into a non-push last entry", () => {
    enqueue({ type: "other", payload: {} } as never);
    enqueue({ type: "push", modules: { finyk: { data: {} } } } as never);
    const q = getOfflineQueue();
    expect(q).toHaveLength(2);
    expect(q[0].type).toBe("other");
    expect(q[1].type).toBe("push");
  });

  it("is idempotent wrt queue contents when coalescing repeated pushes", () => {
    const payload = { finyk: { data: { v: "same" } } };
    enqueue({ type: "push", modules: payload } as never);
    enqueue({ type: "push", modules: payload } as never);
    enqueue({ type: "push", modules: payload } as never);
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.finyk.data.v).toBe("same");
  });
});

describe("offline queue + corruption end-to-end", () => {
  it("getOfflineQueue tolerates entirely corrupted storage", () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_OFFLINE_QUEUE, "{not json");
    expect(getOfflineQueue()).toEqual([]);
  });

  it("collectQueuedModules tolerates a mix of valid and corrupted entries", () => {
    const q = [
      null,
      { type: "push", modules: { finyk: { data: { v: 1 } } } },
      "garbage",
      { type: "push", modules: "not-an-object" },
      { type: "push", modules: { fizruk: { data: { v: 2 } } } },
      { malformed: true },
    ];
    const out = collectQueued(q);
    expect(Object.keys(out).sort()).toEqual(["finyk", "fizruk"]);
  });
});
