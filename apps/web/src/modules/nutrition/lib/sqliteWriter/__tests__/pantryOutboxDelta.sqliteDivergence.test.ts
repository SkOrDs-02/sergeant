// rel-10 (зауваження ревʼю): дельта комори рахується відносно `prev`, а `prev`
// - warm-кеш, де id позицій виведено заново з позиції (`pid::idx::name`), тоді
// як рядки SQLite мають свої id. Незмінна позиція, чийого похідного id немає в
// SQLite, не має ставати жертвою soft-delete: тест іде реальним шляхом
// (dualWrite -> applyPullOp -> refresh кешу -> peek-знімок -> правка).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { normalizePantries } from "@sergeant/nutrition-domain";

import {
  __clearNutritionDualWriteContextForTests,
  dualWriteNutritionState,
  registerNutritionDualWriteContext,
  type NutritionDualWriteState,
} from "../index.js";
import type { NutritionPantrySnapshot } from "../diff.js";
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

function snap(
  items: NutritionPantrySnapshot["items"],
): NutritionPantrySnapshot {
  return { id: "p1", name: "Дім", text: "", items };
}

function entry(idx: number, name: string, qty = 1) {
  return { id: `p1::${idx}::${name}`, name, qty, unit: "шт", notes: null };
}

/** Те саме, що `peekNutritionDualWriteState`: знімок із warm-кешу. */
async function peekPantries(): Promise<NutritionPantrySnapshot[]> {
  await refreshNutritionSqliteState(handle.client, UID);
  return extractPantrySnapshots(
    normalizePantries(getCachedNutritionSqliteState().pantries),
  );
}

async function livePantryRows() {
  return handle.client.all<{ id: string; name: string }>(
    "SELECT id, name FROM nutrition_pantry_items WHERE pantry_id = 'p1' AND deleted_at IS NULL ORDER BY sort_order, id",
  );
}

describe("rel-10: дельта комори звіряється з SQLite, а не лише з prev", () => {
  it("збіг sort_order після pull: правка іншої позиції не soft-delete-ить незмінну", async () => {
    // Пристрій A: [a, milk] -> рядки p1::0::a, p1::1::milk.
    await dualWriteNutritionState(
      state([snap([])]),
      state([snap([entry(0, "a"), entry(1, "milk")])]),
    );
    // Pull з пристрою B: bread з тим самим sort_order 1, але іншим id.
    const t = new Date(Date.parse(TS1) + 60_000).toISOString();
    const outcome = await applyPullOp(
      handle.client,
      {
        id: 1,
        table: "nutrition_pantry_items",
        op: "insert",
        row: {
          id: "p1::1::bread",
          pantry_id: "p1",
          user_id: UID,
          name: "bread",
          qty: 1,
          unit: "шт",
          notes: null,
          sources: null,
          sort_order: 1,
        },
        client_ts: t,
        server_ts: t,
        origin_device_id: "device-b",
      },
      UID,
      "device-a",
    );
    expect(outcome).toBe("applied");

    // Знімок із кешу: похідні id не збігаються з id рядків SQLite.
    const prev = await peekPantries();
    const derivedIds = prev[0]!.items.map((i) => i.id);
    expect(derivedIds).toHaveLength(3);
    const sqliteIds = (await livePantryRows()).map((r) => r.id).sort();
    expect(derivedIds.slice().sort()).not.toEqual(sqliteIds);

    // Користувач змінює qty у першій позиції "a".
    const next = [
      {
        ...snap(prev[0]!.items),
        items: prev[0]!.items.map((it, idx) =>
          idx === 0 ? { ...it, qty: 9 } : it,
        ),
      },
    ];
    enqueueMock.mockClear();
    await dualWriteNutritionState(state(prev), state(next));

    const calls = (
      enqueueMock.mock.calls as [
        unknown,
        { table: string; op: string; row: { id: string } },
      ][]
    ).map(([, input]) => input);
    // Позиція milk переїздить під похідний id (позиційні id, data-40): новий
    // рядок йде в outbox, старий id soft-delete-иться. Без звірки з SQLite
    // нового рядка не було б, і delete старого id знищував би позицію.
    const ops = (op: string) =>
      calls
        .filter((c) => c.table === "nutrition_pantry_items" && c.op === op)
        .map((c) => c.row.id);
    expect(ops("insert")).toContain(
      derivedIds.find((id) => id.endsWith("milk")),
    );
    expect(ops("delete")).toEqual(
      sqliteIds.filter((id) => !derivedIds.includes(id)),
    );
    const live = (await livePantryRows()).map((r) => r.name).sort();
    expect(live).toEqual(["a", "bread", "milk"]);
  });
});
