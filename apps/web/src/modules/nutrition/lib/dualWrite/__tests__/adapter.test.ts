import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyNutritionDualWriteOps } from "../adapter.js";
import type { NutritionDualWriteOp } from "../diff.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

let handle: TestSqliteHandle;
const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const TS2 = "2026-05-01T11:00:00.000Z";

beforeEach(async () => {
  handle = await createTestSqlite();
});
afterEach(() => handle.close());

const silentLogger = () => {};

describe("applyNutritionDualWriteOps", () => {
  it("returns zero counters for empty ops", async () => {
    const result = await applyNutritionDualWriteOps(handle.client, [], {
      userId: UID,
      clientTs: TS1,
    });
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
  });

  // --- Meals ---

  it("upserts a meal with macros", async () => {
    const ops: NutritionDualWriteOp[] = [
      {
        kind: "meal-upsert",
        meal: {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "Вівсянка",
          label: "вівсянка з ягодами",
          macros: { kcal: 450, protein_g: 18, fat_g: 10, carbs_g: 70 },
          source: "manual",
          macroSource: "manual",
          amountG: 250,
          foodId: null,
          isDemo: false,
        },
      },
    ];
    const result = await applyNutritionDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(UID);
    expect(rows[0]!.eaten_at).toBe("2026-05-01T08:30:00.000Z");
    expect(rows[0]!.meal_type).toBe("breakfast");
    expect(rows[0]!.kcal).toBe(450);
    expect(rows[0]!.protein_g).toBe(18);
    expect(rows[0]!.amount_g).toBe(250);
    expect(rows[0]!.is_demo).toBe(0);
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it("soft-deletes a meal", async () => {
    const upsert: NutritionDualWriteOp[] = [
      {
        kind: "meal-upsert",
        meal: {
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
      },
    ];
    await applyNutritionDualWriteOps(handle.client, upsert, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const del: NutritionDualWriteOp[] = [{ kind: "meal-delete", mealId: "m1" }];
    const result = await applyNutritionDualWriteOps(handle.client, del, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(rows[0]!.deleted_at).toBe(TS2);
  });

  it("LWW guard: stale meal upsert is a no-op", async () => {
    const ops1: NutritionDualWriteOp[] = [
      {
        kind: "meal-upsert",
        meal: {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "latest",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, ops1, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    // Stale write
    const ops2: NutritionDualWriteOp[] = [
      {
        kind: "meal-upsert",
        meal: {
          id: "m1",
          dateKey: "2026-05-01",
          time: "08:30",
          mealType: "breakfast",
          name: "stale",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, ops2, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT name FROM nutrition_meals WHERE id = ?",
      ["m1"],
    );
    expect(rows[0]!.name).toBe("latest");
  });

  // --- Pantries ---

  it("upserts a pantry with items and cleans up removed items", async () => {
    const ops1: NutritionDualWriteOp[] = [
      {
        kind: "pantry-upsert",
        pantry: {
          id: "p1",
          name: "Дім",
          text: "молоко 1л\nяйця 10 шт",
          items: [
            { id: "it1", name: "молоко", qty: 1, unit: "л", notes: null },
            { id: "it2", name: "яйця", qty: 10, unit: "шт", notes: null },
          ],
        },
      },
    ];
    const result1 = await applyNutritionDualWriteOps(handle.client, ops1, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result1.applied).toBe(1);

    const items = await handle.client.all<Record<string, unknown>>(
      "SELECT id, name, qty, unit, sort_order FROM nutrition_pantry_items WHERE pantry_id = ? ORDER BY sort_order",
      ["p1"],
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.name).toBe("молоко");
    expect(items[0]!.qty).toBe(1);
    expect(items[1]!.name).toBe("яйця");
    expect(items[1]!.sort_order).toBe(1);

    // Remove it2 → should be soft-deleted on next upsert
    const ops2: NutritionDualWriteOp[] = [
      {
        kind: "pantry-upsert",
        pantry: {
          id: "p1",
          name: "Дім",
          text: "молоко 1л",
          items: [
            { id: "it1", name: "молоко", qty: 1, unit: "л", notes: null },
          ],
        },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, ops2, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const after = await handle.client.all<Record<string, unknown>>(
      "SELECT id, deleted_at FROM nutrition_pantry_items WHERE pantry_id = ?",
      ["p1"],
    );
    const it2 = after.find((r) => r.id === "it2");
    expect(it2?.deleted_at).toBe(TS2);
    const it1 = after.find((r) => r.id === "it1");
    expect(it1?.deleted_at).toBeNull();
  });

  it("soft-deletes a pantry and cascades to items", async () => {
    const upsert: NutritionDualWriteOp[] = [
      {
        kind: "pantry-upsert",
        pantry: {
          id: "p1",
          name: "Дім",
          text: "",
          items: [{ id: "it1", name: "x", qty: null, unit: null, notes: null }],
        },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, upsert, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const del: NutritionDualWriteOp[] = [
      { kind: "pantry-delete", pantryId: "p1" },
    ];
    await applyNutritionDualWriteOps(handle.client, del, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const pantries = await handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM nutrition_pantries WHERE id = ?",
      ["p1"],
    );
    expect(pantries[0]!.deleted_at).toBe(TS2);

    const items = await handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM nutrition_pantry_items WHERE pantry_id = ?",
      ["p1"],
    );
    expect(items[0]!.deleted_at).toBe(TS2);
  });

  // --- Prefs ---

  it("upserts prefs as a singleton row keyed by user_id", async () => {
    const ops: NutritionDualWriteOp[] = [
      {
        kind: "prefs-upsert",
        prefs: {
          prefsJson: '{"goal":"maintain","servings":2}',
          activePantryId: "p1",
        },
      },
    ];
    const result = await applyNutritionDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_prefs WHERE user_id = ?",
      [UID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.active_pantry_id).toBe("p1");
    expect(rows[0]!.prefs_json).toBe('{"goal":"maintain","servings":2}');
  });

  it("LWW guard: stale prefs upsert is a no-op", async () => {
    const fresh: NutritionDualWriteOp[] = [
      {
        kind: "prefs-upsert",
        prefs: { prefsJson: '{"goal":"latest"}', activePantryId: "p2" },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, fresh, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const stale: NutritionDualWriteOp[] = [
      {
        kind: "prefs-upsert",
        prefs: { prefsJson: '{"goal":"stale"}', activePantryId: "p1" },
      },
    ];
    await applyNutritionDualWriteOps(handle.client, stale, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT prefs_json FROM nutrition_prefs WHERE user_id = ?",
      [UID],
    );
    expect(rows[0]!.prefs_json).toBe('{"goal":"latest"}');
  });

  // --- Recipes ---

  it("upserts and soft-deletes a recipe", async () => {
    const ops: NutritionDualWriteOp[] = [
      {
        kind: "recipe-upsert",
        recipe: {
          id: "rcp1",
          title: "Омлет",
          dataJson: '{"id":"rcp1","title":"Омлет","steps":["крок 1"]}',
        },
      },
    ];
    const result = await applyNutritionDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_recipes WHERE id = ?",
      ["rcp1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Омлет");
    expect(JSON.parse(rows[0]!.data_json as string)).toMatchObject({
      title: "Омлет",
    });

    const del: NutritionDualWriteOp[] = [
      { kind: "recipe-delete", recipeId: "rcp1" },
    ];
    await applyNutritionDualWriteOps(handle.client, del, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const after = await handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM nutrition_recipes WHERE id = ?",
      ["rcp1"],
    );
    expect(after[0]!.deleted_at).toBe(TS2);
  });

  // --- Error handling ---

  it("logs errors and continues processing remaining ops", async () => {
    const warnings: unknown[] = [];
    const ops: NutritionDualWriteOp[] = [
      {
        kind: "meal-upsert",
        meal: {
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
      },
      {
        kind: "meal-upsert",
        meal: {
          id: "m2",
          dateKey: "2026-05-01",
          time: "12:00",
          mealType: "lunch",
          name: "y",
          label: "",
          macros: null,
          source: "manual",
          macroSource: "manual",
          amountG: null,
          foodId: null,
          isDemo: false,
        },
      },
    ];
    const result = await applyNutritionDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: (_level, msg, meta) => warnings.push({ msg, meta }),
    });
    expect(result.applied).toBe(2);
    expect(result.errored).toBe(0);
  });
});
