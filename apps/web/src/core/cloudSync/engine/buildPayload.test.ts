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
  // Reset exclusion flags between tests. PR #030 retired `fizruk`
  // from SYNC_MODULES (storage-roadmap Stage 4) so we no longer
  // touch its exclusion flag here.
  setModuleSyncExcluded("finyk", false);
  setModuleSyncExcluded("nutrition", false);
  setModuleSyncExcluded("profile", false);
});

describe("buildModulesPayload", () => {
  it("returns empty object when no modules have local data", () => {
    expect(buildModulesPayload(["finyk", "nutrition"], {})).toEqual({});
  });

  it("returns empty object when modifiedTimes is empty and no LS data is set", () => {
    expect(buildModulesPayload(["finyk"], {})).toEqual({});
  });

  it("includes module with collected data and stamps clientUpdatedAt", () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_BUDGETS,
      JSON.stringify([{ id: 1 }]),
    );
    const result = buildModulesPayload(["finyk"], {
      finyk: "2026-04-15T00:00:00.000Z",
    });
    expect(result.finyk).toBeDefined();
    expect(result.finyk.clientUpdatedAt).toBe("2026-04-15T00:00:00.000Z");
    expect(result.finyk.data).toMatchObject({
      [STORAGE_KEYS.FINYK_BUDGETS]: [{ id: 1 }],
    });
  });

  it("falls back to current ISO timestamp when modifiedTimes lacks the module", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, JSON.stringify([]));
    const before = Date.now();
    const result = buildModulesPayload(["finyk"], {});
    const after = Date.now();
    const ts = Date.parse(result.finyk.clientUpdatedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("skips modules without any local data", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    const result = buildModulesPayload(["finyk", "nutrition"], {
      finyk: "2026-04-15T00:00:00.000Z",
      nutrition: "2026-04-15T00:00:00.000Z",
    });
    expect(Object.keys(result)).toEqual(["finyk"]);
  });

  it("skips modules excluded via setModuleSyncExcluded", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    localStorage.setItem(STORAGE_KEYS.NUTRITION_LOG, "{}");
    setModuleSyncExcluded("finyk", true);
    const result = buildModulesPayload(["finyk", "nutrition"], {
      finyk: "2026-04-15T00:00:00.000Z",
      nutrition: "2026-04-15T00:00:00.000Z",
    });
    expect(Object.keys(result)).toEqual(["nutrition"]);
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

  it("ignores unknown module names without crashing", () => {
    const result = buildModulesPayload(["finyk", "ghost"], {});
    expect(Object.keys(result)).toEqual([]);
  });
});
