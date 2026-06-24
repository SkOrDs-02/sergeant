/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the per-module backup adapters so this suite exercises the Hub
// routing/branch logic in isolation (which module fn is invoked, with
// what), independent of each module's own (separately tested) restore.
const normalizeFinykBackup = vi.fn((v: unknown) => v);
const readFinykBackupFromStorage = vi.fn(() => ({}));
const persistFinykNormalizedToStorage = vi.fn();
vi.mock("../../modules/finyk/lib/finykBackup", () => ({
  normalizeFinykBackup: (v: unknown) => normalizeFinykBackup(v),
  readFinykBackupFromStorage: () => readFinykBackupFromStorage(),
  persistFinykNormalizedToStorage: (v: unknown) =>
    persistFinykNormalizedToStorage(v),
}));

const buildFizrukFullBackupPayload = vi.fn(() => ({ fizruk: true }));
const applyFizrukFullBackupPayload = vi.fn();
vi.mock("../../modules/fizruk/lib/fizrukStorage", () => ({
  buildFizrukFullBackupPayload: () => buildFizrukFullBackupPayload(),
  applyFizrukFullBackupPayload: (v: unknown) => applyFizrukFullBackupPayload(v),
}));

const buildRoutineBackupPayload = vi.fn(() => ({ routine: true }));
const applyRoutineBackupPayload = vi.fn();
vi.mock("../../modules/routine/lib/routineStorage", () => ({
  buildRoutineBackupPayload: () => buildRoutineBackupPayload(),
  applyRoutineBackupPayload: (v: unknown) => applyRoutineBackupPayload(v),
}));

const buildNutritionBackupPayload = vi.fn(() => ({ nutrition: true }));
const applyNutritionBackupPayload = vi.fn();
vi.mock("../../modules/nutrition/domain/nutritionBackup", () => ({
  buildNutritionBackupPayload: () => buildNutritionBackupPayload(),
  applyNutritionBackupPayload: (v: unknown) => applyNutritionBackupPayload(v),
}));

import {
  HUB_BACKUP_KIND,
  HUB_BACKUP_SCHEMA_VERSION,
  applyHubBackupPayload,
  buildHubBackupPayload,
} from "./hubBackup";

const HUB_MODULE_KEY = "hub_last_module";
const HUB_CHAT_KEY = "hub_chat_history";

function validPayload(over: Record<string, unknown> = {}) {
  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    finyk: {},
    fizruk: { fizruk: true },
    routine: { routine: true },
    nutrition: { nutrition: true },
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("buildHubBackupPayload — hub / chat branches", () => {
  it("includes lastModule when present and omits chatHistory by default", () => {
    localStorage.setItem(HUB_MODULE_KEY, "finyk");
    localStorage.setItem(HUB_CHAT_KEY, "[]");
    const payload = buildHubBackupPayload();
    expect(payload.hub).toEqual({ lastModule: "finyk" });
    expect(payload.hub?.chatHistory).toBeUndefined();
  });

  it("includes chatHistory when includeChat is true", () => {
    localStorage.setItem(HUB_CHAT_KEY, '[{"role":"user"}]');
    const payload = buildHubBackupPayload({ includeChat: true });
    expect(payload.hub?.chatHistory).toBe('[{"role":"user"}]');
  });

  it("leaves hub undefined when no hub keys are stored", () => {
    const payload = buildHubBackupPayload({ includeChat: true });
    expect(payload.hub).toBeUndefined();
  });

  it("falls back to {} for finyk when normalize throws", () => {
    normalizeFinykBackup.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const payload = buildHubBackupPayload();
    expect(payload.finyk).toEqual({});
  });
});

describe("applyHubBackupPayload", () => {
  it("throws on a non-hub-backup object", () => {
    expect(() => applyHubBackupPayload({ kind: "other" })).toThrow(
      /резервної копії/,
    );
  });

  it("routes each module section to its apply fn", () => {
    applyHubBackupPayload(
      validPayload({ finyk: { accounts: [], version: 1 } }),
    );
    expect(persistFinykNormalizedToStorage).toHaveBeenCalledTimes(1);
    expect(applyRoutineBackupPayload).toHaveBeenCalledWith({ routine: true });
    expect(applyFizrukFullBackupPayload).toHaveBeenCalledWith({ fizruk: true });
    expect(applyNutritionBackupPayload).toHaveBeenCalledWith({
      nutrition: true,
    });
  });

  it("injects version:1 into finyk when missing before persisting", () => {
    applyHubBackupPayload(validPayload({ finyk: { accounts: [{ id: "a" }] } }));
    expect(persistFinykNormalizedToStorage).toHaveBeenCalledTimes(1);
    const normalizeArg = normalizeFinykBackup.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(normalizeArg["version"]).toBe(1);
  });

  it("skips finyk persist when only a version key is present (no real data)", () => {
    applyHubBackupPayload(validPayload({ finyk: { version: 1 } }));
    expect(persistFinykNormalizedToStorage).not.toHaveBeenCalled();
  });

  it("skips finyk persist when finyk is empty object", () => {
    applyHubBackupPayload(validPayload({ finyk: {} }));
    expect(persistFinykNormalizedToStorage).not.toHaveBeenCalled();
  });

  it("restores a valid hub.lastModule but ignores an unknown module", () => {
    applyHubBackupPayload(validPayload({ hub: { lastModule: "finyk" } }));
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBe("finyk");

    localStorage.clear();
    applyHubBackupPayload(
      validPayload({ hub: { lastModule: "bogus-module" } }),
    );
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBeNull();
  });

  it("restores hub.chatHistory when it is a string", () => {
    applyHubBackupPayload(
      validPayload({ hub: { chatHistory: '[{"role":"user"}]' } }),
    );
    expect(localStorage.getItem(HUB_CHAT_KEY)).toBe('[{"role":"user"}]');
  });

  it("does not call module apply fns for absent sections", () => {
    applyHubBackupPayload({
      kind: HUB_BACKUP_KIND,
      schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
      finyk: null,
      routine: null,
      fizruk: null,
      nutrition: null,
    });
    expect(persistFinykNormalizedToStorage).not.toHaveBeenCalled();
    expect(applyRoutineBackupPayload).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
    expect(applyNutritionBackupPayload).not.toHaveBeenCalled();
  });
});
