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
import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
} from "../../../../../core/db/storageBackendState.js";
import { journalDualWrite } from "../../../../../core/durability/dualWriteJournal.js";
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
    __resetActiveSqliteVfsForTests();
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

  describe("data-10: знімки memory-сесії не реплеїться як повна заміна", () => {
    const APPLE = {
      id: "p-journal::0::яблуко",
      name: "яблуко",
      qty: 3,
      unit: "шт",
      notes: null,
      sources: null,
    };
    const livePantryItems = () =>
      handle.client.all<{ id: string }>(
        "SELECT id FROM nutrition_pantry_items WHERE pantry_id = ? AND deleted_at IS NULL",
        ["p-journal"],
      );

    /** Справжня база вже має синхронізовану позицію комори. */
    async function seedLiveItem(): Promise<void> {
      registerNutritionDualWriteContext(
        ctx({ getNow: () => "2026-10-01T10:00:00.000Z" }),
      );
      triggerNutritionDualWrite(
        state([]),
        state([{ id: "p-journal", name: "Дім", text: "", items: [APPLE] }]),
      );
      await vi.waitFor(
        async () => expect(await livePantryItems()).toHaveLength(1),
        {
          timeout: 10_000,
        },
      );
      await vi.waitFor(
        () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
        { timeout: 10_000 },
      );
      __clearNutritionDualWriteContextForTests();
    }

    it("реплей порожнього знімка, застосованого в memory-режимі, не видаляє живі позиції", async () => {
      await seedLiveItem();

      // Сесія з упалим OPFS: знімок порожньої комори «застосовується» у
      // memory-базі, а запис лишається в журналі позначеним.
      noteActiveSqliteVfs("memory");
      const memoryDb = await createTestSqlite();
      registerNutritionDualWriteContext(
        ctx({
          getMigrationClient: async () => memoryDb.client,
          getNow: () => "2026-10-02T05:28:08.201Z",
        }),
      );
      triggerNutritionDualWrite(
        state([]),
        state([{ id: "p-journal", name: "Дім", text: "", items: [] }]),
      );
      await vi.waitFor(
        () =>
          expect(
            pendingDualWrites("nutrition", USER_ID).some(
              (e) => e.appliedInMemory === true,
            ),
          ).toBe(true),
        { timeout: 10_000 },
      );
      __clearNutritionDualWriteContextForTests();
      memoryDb.close();

      // Сховище ожило: наступний бут реплеїть журнал на справжній базі.
      __resetActiveSqliteVfsForTests();
      registerNutritionDualWriteContext(ctx());
      await vi.waitFor(
        () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
        { timeout: 10_000 },
      );

      expect(await livePantryItems()).toEqual([{ id: APPLE.id }]);
    });

    it("реплей звичайного (не memory) запису лишає soft-delete: видалення користувача не губиться", async () => {
      await seedLiveItem();

      journalDualWrite("nutrition", USER_ID, {
        ops: [
          {
            kind: "pantry-upsert",
            pantry: { id: "p-journal", name: "Дім", text: "", items: [] },
          },
        ],
        clientTs: "2026-10-02T06:00:00.000Z",
      });
      registerNutritionDualWriteContext(ctx());
      await vi.waitFor(
        () => expect(pendingDualWrites("nutrition", USER_ID)).toEqual([]),
        { timeout: 10_000 },
      );

      expect(await livePantryItems()).toEqual([]);
    });
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
