import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

import {
  __clearNutritionDualWriteContextForTests,
  registerNutritionDualWriteContext,
  triggerNutritionDualWrite,
  type NutritionDualWriteContext,
} from "../index.js";
import type { NutritionDualWriteState } from "../diff.js";
import {
  DUAL_WRITE_JOURNAL_KEY,
  pendingDualWrites,
} from "../../../../../core/durability/dualWriteJournal.js";
import { installMemoryLocalStorage } from "../../../../../core/durability/__tests__/memoryLocalStorage.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";

function state(
  pantries: NutritionDualWriteState["pantries"],
): NutritionDualWriteState {
  return {
    meals: [],
    pantries,
    prefs: null,
    recipes: [],
    waterLog: {},
    shoppingList: null,
  };
}

describe("Nutrition dual-write journal (аудит 2026-09-28, D1)", () => {
  let handle: Awaited<ReturnType<typeof createTestSqlite>>;

  beforeEach(async () => {
    installMemoryLocalStorage();
    handle = await createTestSqlite();
    __clearNutritionDualWriteContextForTests();
  });

  afterEach(() => {
    __clearNutritionDualWriteContextForTests();
    handle.close();
  });

  function ctx(
    overrides: Partial<NutritionDualWriteContext> = {},
  ): NutritionDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => new Date().toISOString(),
      ...overrides,
    };
  }

  const pantryRows = () =>
    handle.client.all<{ id: string }>(
      "SELECT id FROM nutrition_pantries WHERE id = ? AND deleted_at IS NULL",
      ["p-journal"],
    );

  it("replays a pantry whose page died before the write reached SQLite", async () => {
    registerNutritionDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerNutritionDualWrite(
      state([]),
      state([{ id: "p-journal", name: "Дім", text: "", items: [] }]),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(await pantryRows()).toEqual([]);

    __clearNutritionDualWriteContextForTests();
    registerNutritionDualWriteContext(ctx());

    await vi.waitFor(async () => expect(await pantryRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });

  it("replays a pantry event under the same id, so a lost ack does not duplicate it", async () => {
    registerNutritionDualWriteContext(
      ctx({ getMigrationClient: () => new Promise(() => {}) }),
    );
    triggerNutritionDualWrite(state([]), {
      ...state([]),
      pantryEvents: [
        {
          id: null,
          pantryId: "home",
          itemId: null,
          itemKey: "рис",
          kind: "consume",
          deltaQty: -120,
          absQty: null,
          unit: "г",
          source: "meal_log",
          mealId: null,
        },
      ],
    });
    const journalRaw = localStorage.getItem(DUAL_WRITE_JOURNAL_KEY);
    const [entry] = pendingDualWrites<{
      ops: { kind: string; event?: { id: string | null } }[];
    }>("nutrition", USER_ID);
    const eventId = entry?.payload.ops.find(
      (o) => o.kind === "pantry-event-append",
    )?.event?.id;
    expect(eventId).toEqual(expect.any(String));

    const eventRows = () =>
      handle.client.all<{ id: string }>(
        "SELECT id FROM nutrition_pantry_events",
      );
    for (let attempt = 0; attempt < 2; attempt++) {
      // Друга ітерація: запис уже застосовано, але ack «загубився».
      localStorage.setItem(DUAL_WRITE_JOURNAL_KEY, journalRaw!);
      __clearNutritionDualWriteContextForTests();
      registerNutritionDualWriteContext(ctx());
      await vi.waitFor(
        () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
        { timeout: 10_000 },
      );
    }
    expect(await eventRows()).toEqual([{ id: eventId }]);
  });

  it("keeps the journal entry when the SQL write throws, and applies it on the next boot (data-05)", async () => {
    registerNutritionDualWriteContext(
      ctx({
        getMigrationClient: async () => ({
          ...handle.client,
          run: () => {
            throw new Error("SQLITE_BUSY: database is locked");
          },
        }),
      }),
    );
    triggerNutritionDualWrite(
      state([]),
      state([{ id: "p-journal", name: "Дім", text: "", items: [] }]),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(await pantryRows()).toEqual([]);
    const pending = pendingDualWrites("nutrition", USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);

    __clearNutritionDualWriteContextForTests();
    registerNutritionDualWriteContext(ctx());
    await vi.waitFor(async () => expect(await pantryRows()).toHaveLength(1), {
      timeout: 10_000,
    });
    await vi.waitFor(
      () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
      { timeout: 10_000 },
    );
  });
});
