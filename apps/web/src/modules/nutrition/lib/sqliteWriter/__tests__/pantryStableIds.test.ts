// data-40 (аудит 2026-10-01): id позиції комори виводився з її місця в масиві
// (`pantryId::index::name`), тож видалення сусідньої позиції зсувало id усіх
// наступних, а upsertPantry переписував їх новим client_ts - і паралельна правка
// з іншого пристрою програвала LWW мовчки. Тепер id стабільний
// (`PantryItem.id`), дельта поелементна: прибрана позиція дає рівно один delete,
// змінена - рівно один upsert з тим самим id, решта не чіпається.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { normalizePantries, type Pantry } from "@sergeant/nutrition-domain";

import {
  __clearNutritionDualWriteContextForTests,
  dualWriteNutritionState,
  registerNutritionDualWriteContext,
  type NutritionDualWriteState,
} from "../index.js";
import {
  diffNutritionDualWriteOps,
  type NutritionPantryItemSnapshot,
  type NutritionPantrySnapshot,
} from "../diff.js";
import { applyPullOp } from "../../../../../core/syncEngine/applyPullOp.js";
import { extractPantrySnapshots } from "../../nutritionStorage.js";
import {
  getCachedNutritionSqliteState,
  refreshNutritionSqliteState,
} from "../../sqliteReader.js";
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
    getNow: () => new Date(Date.parse(TS1) + (tick += 1000)).toISOString(),
    logger: () => {},
  });
});

afterEach(() => {
  __clearNutritionDualWriteContextForTests();
  handle.close();
});

function state(
  pantries: readonly NutritionPantrySnapshot[],
): NutritionDualWriteState {
  return {
    meals: [],
    pantries,
    prefs: null,
    recipes: [],
    waterLog: {},
    shoppingList: null,
    pantryEvents: [],
  };
}

function snapItem(
  id: string,
  name: string,
  qty = 1,
): NutritionPantryItemSnapshot {
  return { id, name, qty, unit: "шт", notes: null };
}

function pantry(
  items: readonly NutritionPantryItemSnapshot[],
  id = "home",
): NutritionPantrySnapshot {
  return { id, name: "Комора", text: "", items };
}

type Call = { table: string; op: string; row: Record<string, unknown> };

function items(op: string): Call[] {
  return (enqueueMock.mock.calls as [unknown, Call][])
    .map(([, input]) => input)
    .filter((c) => c.table === "nutrition_pantry_items" && c.op === op);
}

const A = snapItem("pi_a", "а");
const B = snapItem("pi_b", "б");
const C = snapItem("pi_c", "в");
const D = snapItem("pi_d", "г");

describe("data-40: стабільні id позицій у знімку", () => {
  it("extractPantrySnapshots бере PantryItem.id, а не позицію", () => {
    const pantries: Pantry[] = [
      {
        id: "home",
        name: "Комора",
        text: "",
        items: [
          { id: "pi_a", name: "а", qty: 1, unit: "шт", notes: null },
          { id: "pi_b", name: "б", qty: 1, unit: "шт", notes: null },
        ],
      },
    ];
    const before = extractPantrySnapshots(pantries)[0]!.items.map((i) => i.id);
    const afterRemovingFirst = extractPantrySnapshots([
      { ...pantries[0]!, items: pantries[0]!.items.slice(1) },
    ])[0]!.items.map((i) => i.id);
    expect(before).toEqual(["pi_a", "pi_b"]);
    expect(afterRemovingFirst).toEqual(["pi_b"]);
  });

  it("змішані версії: безідова стара позиція + нова позиція з id - без дублікатів", () => {
    const pantries: Pantry[] = [
      {
        id: "home",
        name: "Комора",
        text: "",
        items: [
          { name: "молоко", qty: 1, unit: "л", notes: null },
          { id: "pi_new", name: "кефір", qty: 1, unit: "л", notes: null },
        ],
      },
    ];
    const ids = extractPantrySnapshots(pantries)[0]!.items.map((i) => i.id);
    expect(ids).toEqual(["home::0::молоко", "pi_new"]);
    // Другий пристрій/версія дає ті самі id.
    expect(extractPantrySnapshots(pantries)[0]!.items.map((i) => i.id)).toEqual(
      ids,
    );
  });
});

describe("data-40: diff комори поелементний", () => {
  it("позицію №1 видалено, №3 змінено -> рівно один delete (№1) і один upsert (№3) з тим самим id", () => {
    const prev = state([pantry([A, B, C, D])]);
    const next = state([pantry([B, { ...C, qty: 7 }, D])]);

    const ops = diffNutritionDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    if (op.kind !== "pantry-upsert")
      throw new Error("очікувався pantry-upsert");
    expect(op.removedItemIds).toEqual(["pi_a"]);
    expect(op.changedItemIds).toEqual(["pi_c"]);
  });

  it("переїзд позиції в інше місце - не видалення в старому", () => {
    const prev = state([pantry([A, B], "fridge"), pantry([], "home")]);
    const next = state([pantry([B], "fridge"), pantry([A], "home")]);
    const ops = diffNutritionDualWriteOps(prev, next);
    const byPantry = new Map(
      ops.flatMap((o) =>
        o.kind === "pantry-upsert" ? [[o.pantry.id, o]] : [],
      ),
    );
    expect(byPantry.get("fridge")!.removedItemIds).toEqual([]);
    expect(byPantry.get("home")!.changedItemIds).toEqual(["pi_a"]);
  });
});

describe("data-40: sync-оп-и (outbox) і SQLite", () => {
  it("видалення першої з трьох позицій: один delete, жодного upsert сусідів", async () => {
    await dualWriteNutritionState(
      state([pantry([])]),
      state([pantry([A, B, C])]),
    );
    enqueueMock.mockClear();

    await dualWriteNutritionState(
      state([pantry([A, B, C])]),
      state([pantry([B, C])]),
    );

    expect(items("insert")).toHaveLength(0);
    expect(items("delete").map((c) => c.row["id"])).toEqual(["pi_a"]);
    const live = await handle.client.all<{ id: string }>(
      "SELECT id FROM nutrition_pantry_items WHERE deleted_at IS NULL ORDER BY sort_order, id",
    );
    expect(live.map((r) => r.id)).toEqual(["pi_b", "pi_c"]);
  });

  it("офлайн-правка кількості останньої позиції переживає видалення першої на іншому пристрої", async () => {
    // Пристрій A має [a, b, c] (кожен рядок записано локально).
    await dualWriteNutritionState(
      state([pantry([])]),
      state([pantry([A, B, C])]),
    );
    // Пристрій B прибрав "a": на A це приїжджає як delete-оп з pull.
    const tB = new Date(Date.parse(TS1) + 120_000).toISOString();
    const pulled = await applyPullOp(
      handle.client,
      {
        id: 1,
        table: "nutrition_pantry_items",
        op: "delete",
        row: { id: "pi_a", user_id: UID },
        client_ts: tB,
        server_ts: tB,
        origin_device_id: "device-b",
      },
      UID,
      "device-a",
    );
    expect(pulled).toBe("applied");

    // Знімок із кешу (як `peekNutritionDualWriteState`) і правка qty в "c".
    await refreshNutritionSqliteState(handle.client, UID);
    const prev = extractPantrySnapshots(
      normalizePantries(getCachedNutritionSqliteState().pantries),
    );
    expect(prev[0]!.items.map((i) => i.id)).toEqual(["pi_b", "pi_c"]);
    const next = prev.map((p) => ({
      ...p,
      items: p.items.map((i) => (i.id === "pi_c" ? { ...i, qty: 9 } : i)),
    }));
    enqueueMock.mockClear();
    await dualWriteNutritionState(state(prev), state(next));

    // В outbox їде ЛИШЕ "c" з незмінним sort_order; "b" не переписується.
    expect(items("insert").map((c) => c.row["id"])).toEqual(["pi_c"]);
    expect(items("insert")[0]!.row["qty"]).toBe(9);
    expect(items("insert")[0]!.row["sort_order"]).toBe(2);
    expect(items("delete")).toHaveLength(0);
  });

  it("змішані версії в SQLite: безідова стара позиція не плодить дубль", async () => {
    // Рядок старого клієнта: позиційний id.
    await dualWriteNutritionState(
      state([pantry([])]),
      state([pantry([snapItem("home::0::молоко", "молоко")])]),
    );
    await refreshNutritionSqliteState(handle.client, UID);
    // Кеш віддає id рядка, і PantryItem.id = id рядка.
    const cached = getCachedNutritionSqliteState().pantries[0]!.items;
    expect(cached.map((i) => i.id)).toEqual(["home::0::молоко"]);

    // Нова версія додає позицію; стара лишається (з id з кешу або без нього).
    const withoutId: Pantry[] = [
      {
        id: "home",
        name: "Комора",
        text: "",
        items: [
          { name: "молоко", qty: 1, unit: "шт", notes: null },
          { id: "pi_new", name: "кефір", qty: 1, unit: "шт", notes: null },
        ],
      },
    ];
    const prev = extractPantrySnapshots(
      normalizePantries(getCachedNutritionSqliteState().pantries),
    );
    await dualWriteNutritionState(
      state(prev),
      state(extractPantrySnapshots(withoutId)),
    );

    const live = await handle.client.all<{ id: string; name: string }>(
      "SELECT id, name FROM nutrition_pantry_items WHERE deleted_at IS NULL ORDER BY sort_order, id",
    );
    expect(live.map((r) => r.id)).toEqual(["home::0::молоко", "pi_new"]);
  });

  it("переїзд між місцями зберігає id: рядок живий у новому місці, delete не ставиться", async () => {
    await dualWriteNutritionState(
      state([pantry([], "fridge"), pantry([], "home")]),
      state([pantry([A, B], "fridge"), pantry([], "home")]),
    );
    enqueueMock.mockClear();

    await dualWriteNutritionState(
      state([pantry([A, B], "fridge"), pantry([], "home")]),
      state([pantry([B], "fridge"), pantry([A], "home")]),
    );

    expect(items("delete")).toHaveLength(0);
    const row = await handle.client.all<{
      pantry_id: string;
      deleted_at: string | null;
    }>(
      "SELECT pantry_id, deleted_at FROM nutrition_pantry_items WHERE id = 'pi_a'",
    );
    expect(row).toEqual([{ pantry_id: "home", deleted_at: null }]);
  });
});
