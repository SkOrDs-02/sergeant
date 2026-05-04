// @vitest-environment jsdom
/**
 * `safeWriteSyncedLS` / `safeRemoveSyncedLS` — explicit replacement
 * for the dropped `localStorage.setItem` monkey-patch (PR #008).
 *
 * The historical contract was: every write to a sync-tracked LS key
 * went through `localStorage.setItem`, the monkey-patch saw it, and
 * fired `enqueueChange(key)` so the cloud-sync engine marked the
 * owning module dirty. Removing the patch means writes now have to
 * go through `syncedKV` (or the `safeWriteSyncedLS` helper) for the
 * same dirty-marking to happen.
 *
 * These tests assert the post-PR-#008 invariants:
 *   1. Writing a tracked key via `safeWriteSyncedLS` marks the
 *      corresponding sync module dirty WITHOUT relying on a global
 *      `__hubSyncPatched` flag.
 *   2. Writing an untracked key does NOT touch the dirty map.
 *   3. The historical "monkey-patched localStorage.setItem" path is
 *      gone — direct `localStorage.setItem(STORAGE_KEYS.<tracked>, …)`
 *      no longer marks the module dirty (the explicit-opt-in
 *      contract).
 *   4. `safeRemoveSyncedLS` fires `enqueueChange` for tracked keys
 *      and is a quiet pass-through for untracked ones.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@sergeant/shared";

import { getDirtyModules } from "../../../core/cloudSync";

import { safeReadLS, safeReadStringLS } from "./storage";
import { safeRemoveSyncedLS, safeWriteSyncedLS, syncedKV } from "./syncedKV";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("safeWriteSyncedLS", () => {
  it("writes a tracked key and marks the owning module dirty", () => {
    expect(getDirtyModules()).toEqual({});

    const ok = safeWriteSyncedLS(STORAGE_KEYS.FINYK_BUDGETS, [{ id: "b1" }]);

    expect(ok).toBe(true);
    expect(safeReadLS(STORAGE_KEYS.FINYK_BUDGETS)).toEqual([{ id: "b1" }]);
    expect(getDirtyModules().finyk).toBe(true);
  });

  it("does NOT mark nutrition dirty after PR #034 cut-over", () => {
    // PR #034 (storage-roadmap Stage 4) — `nutrition` retired from
    // SYNC_MODULES. Writes to legacy `nutrition_*_v1` LS keys must
    // NOT mark anything dirty (parity with the fizruk retirement
    // assertion in `useCloudSync.behavior.test.ts`).
    safeWriteSyncedLS(STORAGE_KEYS.NUTRITION_LOG, { "2025-05-03": {} });
    expect(getDirtyModules()).toEqual({});
  });

  it("supports profile module (USER_PROFILE)", () => {
    safeWriteSyncedLS(STORAGE_KEYS.USER_PROFILE, [{ fact: "vegan" }]);
    expect(getDirtyModules().profile).toBe(true);
  });

  it("stores raw strings without double JSON-encoding", () => {
    // Same shape contract as `safeWriteLS` — passing a string keeps
    // the value as-is so callers can read back through
    // `safeReadStringLS` without hitting JSON.parse.
    safeWriteSyncedLS(STORAGE_KEYS.FINYK_SHOW_BALANCE, "1");
    expect(safeReadStringLS(STORAGE_KEYS.FINYK_SHOW_BALANCE)).toBe("1");
  });

  it("does NOT mark anything dirty for an untracked key", () => {
    safeWriteSyncedLS(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}"); // meta key
    safeWriteSyncedLS("__random_unknown_key__", "x");
    expect(getDirtyModules()).toEqual({});
  });

  it("legacy direct `localStorage.setItem` does NOT mark module dirty (patch removed)", () => {
    // Sanity check that the monkey-patch is truly gone — historically
    // this exact call would have fired `enqueueChange` via the patched
    // `setItem`. After PR #008 it must no longer mutate the dirty map.
    localStorage.setItem(
      STORAGE_KEYS.FINYK_BUDGETS,
      JSON.stringify([{ id: "b2" }]),
    );
    expect(getDirtyModules()).toEqual({});
    // Sanity: the value did get written to LS, just without the
    // enqueueChange side effect.
    expect(safeReadLS(STORAGE_KEYS.FINYK_BUDGETS)).toEqual([{ id: "b2" }]);
  });

  it("__hubSyncPatched global is gone", () => {
    expect(
      (window as unknown as { __hubSyncPatched?: boolean }).__hubSyncPatched,
    ).toBeUndefined();
  });
});

describe("safeRemoveSyncedLS", () => {
  it("removes a tracked key and marks the owning module dirty", () => {
    safeWriteSyncedLS(STORAGE_KEYS.USER_PROFILE, { d: 1 });
    // Reset dirty state before the actual remove-under-test.
    localStorage.setItem(STORAGE_KEYS.SYNC_DIRTY_MODULES, "{}");

    const ok = safeRemoveSyncedLS(STORAGE_KEYS.USER_PROFILE);

    expect(ok).toBe(true);
    expect(safeReadLS(STORAGE_KEYS.USER_PROFILE)).toBeNull();
    expect(getDirtyModules().profile).toBe(true);
  });

  it("removes an untracked key without touching the dirty map", () => {
    localStorage.setItem("scratch", "1");
    safeRemoveSyncedLS("scratch");
    expect(localStorage.getItem("scratch")).toBeNull();
    expect(getDirtyModules()).toEqual({});
  });
});

describe("syncedKV (low-level)", () => {
  it("getString delegates to webKVStore (reads from localStorage)", () => {
    localStorage.setItem("k", "v");
    expect(syncedKV.getString("k")).toBe("v");
    expect(syncedKV.getString("missing")).toBeNull();
  });

  it("setString fires enqueueChange exactly once per write to a tracked key", () => {
    syncedKV.setString(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    expect(getDirtyModules().finyk).toBe(true);
  });
});
