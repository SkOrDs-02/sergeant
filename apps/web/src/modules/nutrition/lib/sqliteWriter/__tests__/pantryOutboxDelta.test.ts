// rel-10 (аудит 2026-10-01): кожна зміна комори ставила в sync-outbox upsert
// КОЖНОЇ позиції місця, тож n послідовних додавань давали n(n+1)/2 оп-ів.
// Тепер у outbox йдуть лише змінені позиції; локальний SQLite лишається повним.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  __clearNutritionDualWriteContextForTests,
  applyNutritionDualWriteOps,
  dualWriteNutritionState,
  registerNutritionDualWriteContext,
  type NutritionDualWriteState,
} from "../index.js";
import type {
  NutritionPantryItemSnapshot,
  NutritionPantrySnapshot,
} from "../diff.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const enqueueMock = enqueueOutboxUpsert as ReturnType<typeof vi.fn>;

let handle: TestSqliteHandle;
let tick = 0;

beforeEach(async () => {
  handle = await createTestSqlite();
  tick = 0;
  enqueueMock.mockClear();
  enqueueMock.mockResolvedValue({ id: 1, inserted: true });
  registerNutritionDualWriteContext({
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    // LWW-гард локального upsert-а вимагає строго новішої мітки на кожен запис.
    getNow: () => new Date(Date.parse(TS1) + (tick += 1000)).toISOString(),
    logger: () => {},
  });
});

afterEach(() => {
  __clearNutritionDualWriteContextForTests();
  handle.close();
});

function item(
  n: number,
  overrides: Partial<NutritionPantryItemSnapshot> = {},
): NutritionPantryItemSnapshot {
  return {
    id: `p1_${n}`,
    name: `продукт${n}`,
    qty: 100,
    unit: "г",
    notes: null,
    ...overrides,
  };
}

function state(
  items: readonly NutritionPantryItemSnapshot[],
  pantryOverrides: Partial<NutritionPantrySnapshot> = {},
): NutritionDualWriteState {
  return {
    meals: [],
    pantries: [{ id: "p1", name: "Дім", text: "", items, ...pantryOverrides }],
    prefs: null,
    recipes: [],
    waterLog: {},
    shoppingList: null,
    pantryEvents: [],
  };
}

type OutboxCall = { table: string; op: string; row: { id: string } };

function outboxCalls(table: string, op = "insert"): OutboxCall[] {
  return (enqueueMock.mock.calls as [unknown, OutboxCall][])
    .map(([, input]) => input)
    .filter((i) => i.table === table && i.op === op);
}

describe("rel-10: outbox комори ставить лише змінені позиції", () => {
  it("5 послідовних додавань по одній позиції дають рівно 5 оп-ів items, а не 15", async () => {
    // Перший знімок: порожнє місце -> перша позиція.
    let prev = state([]);
    const all: NutritionPantryItemSnapshot[] = [];
    for (let n = 1; n <= 5; n += 1) {
      all.push(item(n));
      const next = state([...all]);
      const outcome = await dualWriteNutritionState(prev, next);
      expect(outcome.status).toBe("applied");
      prev = next;
    }
    expect(outboxCalls("nutrition_pantry_items")).toHaveLength(5);
    // Локальний SQLite при цьому містить усі 5 позицій.
    const rows = await handle.client.all<{ id: string }>(
      "SELECT id FROM nutrition_pantry_items WHERE pantry_id = ? AND deleted_at IS NULL",
      ["p1"],
    );
    expect(rows).toHaveLength(5);
  });

  it("зміна qty третьої з п'яти позицій дає 1 op items", async () => {
    const before = [1, 2, 3, 4, 5].map((n) => item(n));
    const after = before.map((it) =>
      it.id === "p1_3" ? { ...it, qty: 250 } : it,
    );
    await dualWriteNutritionState(state([]), state(before));
    enqueueMock.mockClear();

    await dualWriteNutritionState(state(before), state(after));

    const itemOps = outboxCalls("nutrition_pantry_items");
    expect(itemOps).toHaveLength(1);
    expect(itemOps[0]!.row.id).toBe("p1_3");
    expect(outboxCalls("nutrition_pantries")).toHaveLength(1);
    // Локально qty оновлено для зміненої позиції, решта не зачеплена.
    const qty = await handle.client.all<{ id: string; qty: number }>(
      "SELECT id, qty FROM nutrition_pantry_items WHERE pantry_id = ? ORDER BY id",
      ["p1"],
    );
    expect(qty.map((r) => r.qty)).toEqual([100, 100, 250, 100, 100]);
  });

  it("зміна лише name місця ставить рядок місця, але жодної позиції", async () => {
    const items = [1, 2, 3].map((n) => item(n));
    await dualWriteNutritionState(state([]), state(items));
    enqueueMock.mockClear();

    await dualWriteNutritionState(
      state(items),
      state([...items], { name: "Дача" }),
    );

    expect(outboxCalls("nutrition_pantries")).toHaveLength(1);
    expect(outboxCalls("nutrition_pantry_items")).toHaveLength(0);
  });

  it("видалення позиції: рядок місця не ставиться, soft-delete позиції доїздить", async () => {
    const items = [1, 2, 3].map((n) => item(n));
    await dualWriteNutritionState(state([]), state(items));
    enqueueMock.mockClear();

    await dualWriteNutritionState(state(items), state(items.slice(0, 2)));

    expect(outboxCalls("nutrition_pantries")).toHaveLength(0);
    expect(outboxCalls("nutrition_pantry_items")).toHaveLength(0);
    const deletes = outboxCalls("nutrition_pantry_items", "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.row.id).toBe("p1_3");
  });

  it("зсув позиції без зміни вмісту теж доїздить (sort_order входить у рядок)", async () => {
    const [a, b] = [item(1), item(2)];
    await dualWriteNutritionState(state([]), state([a, b]));
    enqueueMock.mockClear();

    await dualWriteNutritionState(state([a, b]), state([b, a]));

    expect(
      outboxCalls("nutrition_pantry_items")
        .map((c) => c.row.id)
        .sort(),
    ).toEqual(["p1_1", "p1_2"]);
  });

  it("op без changedItemIds (перший знімок, нова комора) лишається повним upsert-ом", async () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n));
    await dualWriteNutritionState({ ...state([]), pantries: [] }, state(items));
    expect(outboxCalls("nutrition_pantry_items")).toHaveLength(5);
    expect(outboxCalls("nutrition_pantries")).toHaveLength(1);
  });

  it("реплей з keepMissing апсертить ВСІ позиції, навіть якщо changedItemIds вузький", async () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n));
    await applyNutritionDualWriteOps(
      handle.client,
      [
        {
          kind: "pantry-upsert",
          pantry: { id: "p1", name: "Дім", text: "", items },
          keepMissing: true,
          changedItemIds: ["p1_3"],
          pantryFieldsChanged: false,
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    expect(outboxCalls("nutrition_pantry_items")).toHaveLength(5);
    expect(outboxCalls("nutrition_pantries")).toHaveLength(1);
  });
});
