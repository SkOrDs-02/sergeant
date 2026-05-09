/**
 * Stage 8 PR #057n-tombstone — backup apply no longer writes to LS;
 * `persist*` from `../lib/nutritionStorage` now fires
 * `triggerNutritionDualWrite`. The test mocks the dual-write trigger
 * and verifies it receives the restored payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();

vi.mock("../lib/dualWrite/index", async () => {
  const actual = await vi.importActual<typeof import("../lib/dualWrite/index")>(
    "../lib/dualWrite/index",
  );
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
});
