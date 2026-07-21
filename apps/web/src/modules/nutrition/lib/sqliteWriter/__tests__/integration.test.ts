import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Patch enqueueOutboxUpsert so integration tests can assert the outbox
// enqueue shape without a real sync_op_outbox table in the test DB.
// The mock is hoisted via vi.mock so it intercepts the adapter import.
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  __clearNutritionDualWriteContextForTests,
  applyNutritionDualWriteOps,
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
  waterLog: {},
  shoppingList: null,
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
      waterLog: { "2026-05-01": 500 },
      shoppingList: { dataJson: '{"categories":[]}' },
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
    expect(meals[0]!["kcal"]).toBe(450);

    const pantries = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_pantries WHERE id = ?",
      ["p1"],
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!["name"]).toBe("Дім");

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
    expect(prefs[0]!["active_pantry_id"]).toBe("p1");

    const recipes = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM nutrition_recipes WHERE id = ?",
      ["rcp1"],
    );
    expect(recipes).toHaveLength(1);

    // Stage 11 — water-log + shopping-list rows.
    const waterRows = await handle.client.all<Record<string, unknown>>(
      "SELECT date_key, volume_ml FROM nutrition_water_log WHERE user_id = ?",
      [UID],
    );
    expect(waterRows).toEqual([{ date_key: "2026-05-01", volume_ml: 500 }]);

    const shoppingRows = await handle.client.all<Record<string, unknown>>(
      "SELECT user_id, data_json FROM nutrition_shopping_list WHERE user_id = ?",
      [UID],
    );
    expect(shoppingRows).toHaveLength(1);
    expect(shoppingRows[0]!["data_json"]).toBe('{"categories":[]}');
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

// -----------------------------------------------------------------------
// Outbox enqueue wiring
// -----------------------------------------------------------------------

describe("nutrition dualWrite — outbox enqueue wiring", () => {
  const enqueueMock = enqueueOutboxUpsert as ReturnType<typeof vi.fn>;

  let handle: TestSqliteHandle;

  beforeEach(async () => {
    handle = await createTestSqlite();
    enqueueMock.mockClear();
    enqueueMock.mockResolvedValue({ id: 1, inserted: true });
  });

  afterEach(() => {
    __clearNutritionDualWriteContextForTests();
    handle.close();
  });

  it("enqueues nutrition_meals insert on meal-upsert", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "meal-upsert",
          meal: {
            id: "m1",
            dateKey: "2026-07-01",
            time: "08:00",
            mealType: "breakfast",
            name: "Вівсянка",
            label: "вівсянка",
            macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
            source: "manual",
            macroSource: "manual",
            amountG: 200,
            foodId: null,
            isDemo: false,
          },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("nutrition_meals");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      id: "m1",
      user_id: UID,
      meal_type: "breakfast",
    });
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("enqueues nutrition_meals delete on meal-delete", async () => {
    // Seed first
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "meal-upsert",
          meal: {
            id: "m-del",
            dateKey: "2026-07-01",
            time: "08:00",
            mealType: "snack",
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
      ],
      { userId: UID, clientTs: TS1 },
    );
    enqueueMock.mockClear();
    await applyNutritionDualWriteOps(
      handle.client,
      [{ kind: "meal-delete", mealId: "m-del" }],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("nutrition_meals");
    expect(input.op).toBe("delete");
    expect(input.row).toMatchObject({ id: "m-del", user_id: UID });
  });

  it("enqueues nutrition_pantries insert on pantry-upsert", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "pantry-upsert",
          pantry: { id: "p1", name: "Дім", text: "", items: [] },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    const calls = (
      enqueueMock.mock.calls as [unknown, { table: string; op: string }][]
    ).filter(([, i]) => i.table === "nutrition_pantries");
    expect(calls).toHaveLength(1);
    const [, input] = calls[0]!;
    expect(input.op).toBe("insert");
  });

  it("enqueues nutrition_pantry_items insert for each item in pantry-upsert", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "pantry-upsert",
          pantry: {
            id: "p2",
            name: "Офіс",
            text: "",
            items: [
              { id: "it1", name: "молоко", qty: 1, unit: "л", notes: null },
              { id: "it2", name: "хліб", qty: 2, unit: "шт", notes: null },
            ],
          },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    const itemCalls = (
      enqueueMock.mock.calls as [unknown, { table: string }][]
    ).filter(([, i]) => i.table === "nutrition_pantry_items");
    expect(itemCalls).toHaveLength(2);
  });

  it("enqueues nutrition_pantries delete and cascades item deletes on pantry-delete", async () => {
    // Seed a pantry with items first
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "pantry-upsert",
          pantry: {
            id: "p-del",
            name: "Видалити",
            text: "",
            items: [
              { id: "it-del-1", name: "a", qty: null, unit: null, notes: null },
            ],
          },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    enqueueMock.mockClear();
    await applyNutritionDualWriteOps(
      handle.client,
      [{ kind: "pantry-delete", pantryId: "p-del" }],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    const pantryCall = (
      enqueueMock.mock.calls as [unknown, { table: string; op: string }][]
    ).find(([, i]) => i.table === "nutrition_pantries");
    expect(pantryCall).toBeDefined();
    expect(pantryCall![1].op).toBe("delete");
    const itemCall = (
      enqueueMock.mock.calls as [unknown, { table: string; op: string }][]
    ).find(([, i]) => i.table === "nutrition_pantry_items");
    expect(itemCall).toBeDefined();
    expect(itemCall![1].op).toBe("delete");
  });

  it("enqueues nutrition_prefs insert on prefs-upsert", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "prefs-upsert",
          prefs: { prefsJson: '{"goal":"cut"}', activePantryId: null },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("nutrition_prefs");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      user_id: UID,
      prefs_json: '{"goal":"cut"}',
    });
  });

  it("enqueues nutrition_recipes insert on recipe-upsert", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "recipe-upsert",
          recipe: { id: "r1", title: "Омлет", dataJson: '{"steps":[]}' },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("nutrition_recipes");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({ id: "r1", user_id: UID, name: "Омлет" });
  });

  it("enqueues nutrition_recipes delete on recipe-delete", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "recipe-upsert",
          recipe: { id: "r-del", title: "x", dataJson: "{}" },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    enqueueMock.mockClear();
    await applyNutritionDualWriteOps(
      handle.client,
      [{ kind: "recipe-delete", recipeId: "r-del" }],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("nutrition_recipes");
    expect(input.op).toBe("delete");
    expect(input.row).toMatchObject({ id: "r-del", user_id: UID });
  });

  it("enqueues nutrition_water_log insert on water-log-set (via fireSyncOutboxUpsert)", async () => {
    await applyNutritionDualWriteOps(
      handle.client,
      [{ kind: "water-log-set", dateKey: "2026-07-01", volumeMl: 500 }],
      { userId: UID, clientTs: TS1 },
    );
    await Promise.resolve();
    await Promise.resolve();
    const waterCalls = enqueueMock.mock.calls.filter(
      ([, i]) => i.table === "nutrition_water_log",
    );
    expect(waterCalls.length).toBeGreaterThanOrEqual(1);
    const [, input] = waterCalls[0]!;
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({ user_id: UID, date_key: "2026-07-01" });
  });

  it("does NOT reject dualWrite when enqueueOutboxUpsert throws (fire-and-forget)", async () => {
    enqueueMock.mockRejectedValue(new Error("disk full"));
    const result = await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "prefs-upsert",
          prefs: { prefsJson: "{}", activePantryId: null },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    expect(result.applied).toBe(1);
    expect(result.errored).toBe(0);
  });
});
