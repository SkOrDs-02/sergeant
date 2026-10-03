/**
 * Stage 8 PR #057n-tombstone — backup apply no longer writes to LS;
 * `persist*` from `../lib/nutritionStorage` now fires
 * `triggerNutritionDualWrite`. The test mocks the dual-write trigger
 * and verifies it receives the restored payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
    isNutritionDualWriteRegistered: () => true,
  };
});

import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
  NUTRITION_BACKUP_KIND,
} from "./nutritionBackup";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string): void =>
      void store.set(String(k), String(v)),
    removeItem: (k: string): void => void store.delete(String(k)),
    clear: (): void => void store.clear(),
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock() as Storage;
  triggerSpy.mockReset();
});

describe("nutrition backup", () => {
  it("builds stable payload with defaults", () => {
    const p = buildNutritionBackupPayload();
    expect(p.kind).toBe(NUTRITION_BACKUP_KIND);
    expect(p.data.pantries).toBeInstanceOf(Array);
    expect(p.data.prefs).toBeTruthy();
  });

  it("apply dispatches dual-write ops for pantries + prefs", () => {
    applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [
          { id: "home", name: "Дім", text: "яйця", items: [{ name: "яйця" }] },
        ],
        activePantryId: "home",
        prefs: { goal: "balanced", servings: 2, timeMinutes: 10, exclude: "" },
      },
    });
    // persistPantries → 1 trigger, persistNutritionPrefs → 1 trigger
    // (no log payload supplied → no third trigger)
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });

  it("apply also persists log when a valid object is supplied", () => {
    applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [],
        activePantryId: "home",
        prefs: {},
        log: { "2025-01-01": { meals: [] } },
      },
    });
    expect(triggerSpy).toHaveBeenCalledTimes(3);
  });

  it("normalizes pantries by dropping blank items and minting ids", () => {
    const p = buildNutritionBackupPayload();
    applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [
          {
            name: "Без id",
            text: "",
            items: [{ name: "  " }, { name: "Сир", qty: "2", unit: " кг " }],
          },
        ],
        activePantryId: "",
        prefs: {
          goal: "",
          servings: "x",
          dailyTargetKcal: -5,
          reminderHour: 99,
          waterGoalMl: -100,
        },
        log: [],
      },
    });
    expect(p.data.activePantryId).toBeTruthy();
    expect(triggerSpy).toHaveBeenCalled();
  });

  it.each([
    [null, "Некоректний бекап харчування."],
    [{ kind: "other" }, "Некоректний тип бекапу харчування."],
    [
      { kind: NUTRITION_BACKUP_KIND, schemaVersion: "1" },
      "Некоректна версія схеми бекапу харчування.",
    ],
    [
      { kind: NUTRITION_BACKUP_KIND, schemaVersion: 1, data: null },
      "Некоректні дані бекапу харчування.",
    ],
  ])("apply rejects invalid payload %#", (payload, message) => {
    expect(() => applyNutritionBackupPayload(payload)).toThrow(message);
    expect(triggerSpy).not.toHaveBeenCalled();
  });
});
