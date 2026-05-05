// @vitest-environment jsdom
import { STORAGE_KEYS } from "@sergeant/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setModuleSyncExcluded } from "../config";
import { buildModulesPayload } from "./buildPayload";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  // Reset exclusion flags between tests. PR #030 retired `fizruk`,
  // PR #034 retired `nutrition` and PR #039 retired `finyk` from
  // SYNC_MODULES (storage-roadmap Stage 4) so we no longer touch
  // their exclusion flags here — only `profile` remains.
  setModuleSyncExcluded("profile", false);
});

describe("buildModulesPayload", () => {
  it("returns empty object when no modules have local data", () => {
    expect(buildModulesPayload(["profile"], {})).toEqual({});
  });

  it("returns empty object when modifiedTimes is empty and no LS data is set", () => {
    expect(buildModulesPayload(["profile"], {})).toEqual({});
  });

  it("includes module with collected data and stamps clientUpdatedAt", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({ id: 1 }));
    const result = buildModulesPayload(["profile"], {
      profile: "2026-04-15T00:00:00.000Z",
    });
    expect(result.profile).toBeDefined();
    expect(result.profile!.clientUpdatedAt!).toBe("2026-04-15T00:00:00.000Z");
    expect(result.profile!.data!).toMatchObject({
      [STORAGE_KEYS.USER_PROFILE]: { id: 1 },
    });
  });

  it("falls back to current ISO timestamp when modifiedTimes lacks the module", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "{}");
    const before = Date.now();
    const result = buildModulesPayload(["profile"], {});
    const after = Date.now();
    const ts = Date.parse(result.profile!.clientUpdatedAt!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("skips modules without any local data", () => {
    // PR #039: only `profile` is a live SYNC_MODULES entry, so the
    // multi-module test passes a synthetic `_legacy_finyk` placeholder
    // that buildModulesPayload should silently skip (unknown module).
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "{}");
    const result = buildModulesPayload(["profile", "_legacy_finyk" as never], {
      profile: "2026-04-15T00:00:00.000Z",
      _legacy_finyk: "2026-04-15T00:00:00.000Z",
    } as never);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("skips modules excluded via setModuleSyncExcluded", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "{}");
    setModuleSyncExcluded("profile", true);
    const result = buildModulesPayload(["profile"], {
      profile: "2026-04-15T00:00:00.000Z",
    });
    expect(Object.keys(result)).toEqual([]);
  });

  it("skips the retired fizruk module even when its LS keys exist", () => {
    // PR #030 — `fizruk` is no longer in SYNC_MODULES, so legacy
    // `fizruk_*_v1` LS rows must never end up in the push payload.
    localStorage.setItem(STORAGE_KEYS.FIZRUK_WORKOUTS, "[]");
    localStorage.setItem(STORAGE_KEYS.FIZRUK_DAILY_LOG, "{}");
    const result = buildModulesPayload(["fizruk" as never], {
      fizruk: "2026-04-15T00:00:00.000Z",
    } as never);
    expect(Object.keys(result)).toEqual([]);
  });

  it("skips the retired nutrition module even when its LS keys exist", () => {
    // PR #034 — `nutrition` is no longer in SYNC_MODULES, so legacy
    // `nutrition_*_v1` LS rows must never end up in the push payload.
    localStorage.setItem(STORAGE_KEYS.NUTRITION_LOG, "{}");
    localStorage.setItem(STORAGE_KEYS.NUTRITION_PANTRIES, "[]");
    const result = buildModulesPayload(["nutrition" as never], {
      nutrition: "2026-04-15T00:00:00.000Z",
    } as never);
    expect(Object.keys(result)).toEqual([]);
  });

  it("skips the retired finyk module even when its LS keys exist", () => {
    // PR #039 — `finyk` is no longer in SYNC_MODULES, so legacy
    // `finyk_*` LS rows (budgets, subs, tx_cache, …) must never end
    // up in the push payload.
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    localStorage.setItem(STORAGE_KEYS.FINYK_SUBS, "[]");
    localStorage.setItem(STORAGE_KEYS.FINYK_TX_CACHE, "{}");
    const result = buildModulesPayload(["finyk" as never], {
      finyk: "2026-04-15T00:00:00.000Z",
    } as never);
    expect(Object.keys(result)).toEqual([]);
  });

  it("ignores unknown module names without crashing", () => {
    const result = buildModulesPayload(["profile", "ghost"], {});
    expect(Object.keys(result)).toEqual([]);
  });
});
