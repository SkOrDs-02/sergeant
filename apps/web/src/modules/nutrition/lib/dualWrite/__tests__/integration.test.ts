import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearNutritionDualWriteContextForTests,
  dualWriteNutritionState,
  isNutritionDualWriteRegistered,
  registerNutritionDualWriteContext,
  triggerNutritionDualWrite,
  type NutritionDualWriteContext,
  type NutritionDualWriteState,
} from "../index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

let handle: TestSqliteHandle;
const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";

beforeEach(async () => {
  handle = await createTestSqlite();
});
afterEach(() => {
  __clearNutritionDualWriteContextForTests();
  handle.close();
});

function makeCtx(
  overrides: Partial<NutritionDualWriteContext> = {},
): NutritionDualWriteContext {
  return {
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    getNow: () => TS1,
    logger: () => {},
    ...overrides,
  };
}

const EMPTY: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
};

describe("nutrition dualWrite orchestrator", () => {
  it("isNutritionDualWriteRegistered reflects registration state", () => {
    expect(isNutritionDualWriteRegistered()).toBe(false);
    const teardown = registerNutritionDualWriteContext(makeCtx());
    expect(isNutritionDualWriteRegistered()).toBe(true);
    teardown();
    expect(isNutritionDualWriteRegistered()).toBe(false);
  });

  it("returns context-unset when no context registered", async () => {
    const result = await dualWriteNutritionState(EMPTY, EMPTY);
    expect(result).toEqual({ status: "skipped", reason: "context-unset" });
  });

  it("returns no-ops when prev === next", async () => {
    registerNutritionDualWriteContext(makeCtx());
    const result = await dualWriteNutritionState(EMPTY, EMPTY);
    expect(result).toEqual({ status: "skipped", reason: "no-ops" });
  });

  it("returns user-id-missing when getUserId returns null", async () => {
    registerNutritionDualWriteContext(makeCtx({ getUserId: () => null }));
    const next: NutritionDualWriteState = {
      ...EMPTY,
      meals: [
        {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "x",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      ],
    };
    const result = await dualWriteNutritionState(EMPTY, next);
    expect(result).toEqual({ status: "skipped", reason: "user-id-missing" });
  });

  it("returns sqlite-unavailable when getMigrationClient returns null", async () => {
    registerNutritionDualWriteContext(
      makeCtx({ getMigrationClient: async () => null }),
    );
    const next: NutritionDualWriteState = {
      ...EMPTY,
      meals: [
        {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "x",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      ],
    };
    const result = await dualWriteNutritionState(EMPTY, next);
    expect(result).toEqual({ status: "skipped", reason: "sqlite-unavailable" });
  });

  it("end-to-end: writes a meal, pantry, prefs, and recipe to SQLite", async () => {
    registerNutritionDualWriteContext(makeCtx());

    const next: NutritionDualWriteState = {
      meals: [
        {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "Вівсянка",
          label: "вівсянка",
          macros: { kcal: 450, protein_g: 18, fat_g: 10, carbs_g: 70 },
          source: "manual",
          macroSource: "manual",
          amountG: 250,
          foodId: null,
          isDemo: false,
        },
      ],
      pantries: [
        {
          id: "p1",
          name: "Дім",
          text: "молоко 1л",
          items: [
            { id: "it1", name: "молоко", qty: 1, unit: "л", notes: null },
          ],
        },
      ],
      prefs: {
        prefsJson: '{"goal":"maintain"}',
        activePantryId: "p1",
      },
      recipes: [
        {
          id: "rcp1",
          title: "Омлет",
          dataJson: '{"id":"rcp1","title":"Омлет"}',
        },
      ],
    };

    const result = await dualWriteNutritionState(EMPTY, next);
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.result.applied).toBeGreaterThan(0);
      expect(result.result.errored).toBe(0);
    }

    // Verify SQLite rows
    const meals = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(meals).toHaveLength(1);
    expect(meals[0]!.kcal).toBe(450);

    const pantries = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_pantries WHERE id = ?",
      ["p1"],
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.name).toBe("Дім");

    const items = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_pantry_items WHERE pantry_id = ?",
      ["p1"],
    );
    expect(items).toHaveLength(1);

    const prefs = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_prefs WHERE user_id = ?",
      [UID],
    );
    expect(prefs).toHaveLength(1);
    expect(prefs[0]!.active_pantry_id).toBe("p1");

    const recipes = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_recipes WHERE id = ?",
      ["rcp1"],
    );
    expect(recipes).toHaveLength(1);
  });

  it("triggerNutritionDualWrite is fire-and-forget (resolves immediately)", async () => {
    registerNutritionDualWriteContext(makeCtx());
    const next: NutritionDualWriteState = {
      ...EMPTY,
      meals: [
        {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "x",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      ],
    };

    triggerNutritionDualWrite(EMPTY, next);
    // synchronous: row is not yet there
    let rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(rows).toHaveLength(0);

    // After awaiting one microtask, the dual-write completes
    await new Promise((r) => setTimeout(r, 10));
    rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(rows).toHaveLength(1);
  });

  it("triggerNutritionDualWrite does nothing when no context is registered", () => {
    // Should not throw
    expect(() => triggerNutritionDualWrite(EMPTY, EMPTY)).not.toThrow();
  });
});
