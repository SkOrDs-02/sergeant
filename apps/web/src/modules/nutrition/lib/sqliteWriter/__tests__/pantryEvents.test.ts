/**
 * W1-PANTRY-APPEND, СТАДІЯ 2 — diff + adapter для append-only журналу руху
 * комори (`nutrition_pantry_events`).
 *
 * Три питання:
 *
 *   1. Чи diff емітить `pantry-event-append` рівно на нові елементи
 *      `next.pantryEvents` (а не на різницю `prev.pantries`/`next.pantries`)?
 *   2. Чи адаптер пише `INSERT OR IGNORE` без `ON CONFLICT DO UPDATE`
 *      (подія незмінна)?
 *   3. Чи `id` веде себе правильно: `null` у знімку → рандомний (повтор НЕ
 *      схлопується), задане значення (backfill) → лишається як є (повтор
 *      МАЄ схлопнутись)?
 */
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("../../../../../core/syncEngine/fireSyncOutboxUpsert.js", () => ({
  fireSyncOutboxUpsert: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { fireSyncOutboxUpsert } from "../../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import { applyNutritionDualWriteOps } from "../adapter";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteOp,
  type NutritionDualWriteState,
  type NutritionPantryEventSnapshot,
} from "../diff.js";

const EMPTY: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
  waterLog: {},
  shoppingList: null,
  pantryEvents: [],
};

function event(
  over: Partial<NutritionPantryEventSnapshot> = {},
): NutritionPantryEventSnapshot {
  return {
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
    ...over,
  };
}

function pantryOps(ops: NutritionDualWriteOp[]) {
  return ops.filter((o) => o.kind === "pantry-event-append");
}

describe("diff — pantry-event-append емітується з черги, а не зі стану", () => {
  it("емітить рівно один op на один доданий event", () => {
    const ev = event();
    const ops = diffNutritionDualWriteOps(EMPTY, {
      ...EMPTY,
      pantryEvents: [ev],
    });
    const emitted = pantryOps(ops);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ kind: "pantry-event-append", event: ev });
  });

  it("два виклики поспіль (черга росте) — емітить лише НОВИЙ хвіст", () => {
    const first = event({ itemKey: "рис" });
    const second = event({ itemKey: "гречка" });
    const afterFirst: NutritionDualWriteState = {
      ...EMPTY,
      pantryEvents: [first],
    };
    const opsFirst = pantryOps(diffNutritionDualWriteOps(EMPTY, afterFirst));
    expect(opsFirst).toHaveLength(1);

    const afterSecond: NutritionDualWriteState = {
      ...afterFirst,
      pantryEvents: [first, second],
    };
    const opsSecond = pantryOps(
      diffNutritionDualWriteOps(afterFirst, afterSecond),
    );
    expect(opsSecond).toHaveLength(1);
    expect(opsSecond[0]!.event.itemKey).toBe("гречка");
  });

  it("звичайний persistPantries-перехід (pantryEvents не чіпається) — no-op", () => {
    const ops = diffNutritionDualWriteOps(EMPTY, {
      ...EMPTY,
      pantries: [{ id: "home", name: "Дім", text: "", items: [] }],
    });
    expect(pantryOps(ops)).toHaveLength(0);
  });

  it("не падає, коли prev.pantryEvents відсутнє (старі тести без цього поля)", () => {
    // `pantryEvents` — опційне саме заради тестів, написаних до стадії 2
    // (`EMPTY` без цього поля лишається валідним `NutritionDualWriteState`).
    const { pantryEvents: _omit, ...legacyPrev } = EMPTY;
    void _omit;
    const ops = diffNutritionDualWriteOps(
      legacyPrev as NutritionDualWriteState,
      { ...EMPTY, pantryEvents: [event()] },
    );
    expect(pantryOps(ops)).toHaveLength(1);
  });
});

describe("adapter — append-only запис і outbox", () => {
  function makeRecordingClient(): {
    client: SqliteMigrationClient;
    calls: Array<{ sql: string; params: unknown[] }>;
  } {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      run: vi.fn((sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return Promise.resolve(undefined);
      }),
      all: vi.fn(() => Promise.resolve([])),
      exec: vi.fn(() => Promise.resolve(undefined)),
      get: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as SqliteMigrationClient;
    return { client, calls };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fireSyncOutboxUpsert).mockClear();
  });

  it("пише INSERT OR IGNORE, без ON CONFLICT DO UPDATE", async () => {
    const { client, calls } = makeRecordingClient();
    const op: NutritionDualWriteOp = {
      kind: "pantry-event-append",
      event: event(),
    };
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:00.000Z",
    });
    const insert = calls.find((c) =>
      c.sql.includes("nutrition_pantry_events"),
    )!;
    expect(insert.sql).toMatch(/INSERT OR IGNORE INTO nutrition_pantry_events/);
    expect(insert.sql).not.toMatch(/ON CONFLICT/);
  });

  it("event.id === null → генерує id (звичайна дія, повтор не схлопується)", async () => {
    const { client, calls } = makeRecordingClient();
    const op: NutritionDualWriteOp = {
      kind: "pantry-event-append",
      event: event({ id: null }),
    };
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:00.000Z",
    });
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:05.000Z",
    });
    const inserts = calls.filter((c) =>
      c.sql.includes("nutrition_pantry_events"),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.params[0]).not.toBe(inserts[1]!.params[0]);
  });

  it("event.id заданий (backfill) → адаптер лишає його як є (детермінований)", async () => {
    const { client, calls } = makeRecordingClient();
    const op: NutritionDualWriteOp = {
      kind: "pantry-event-append",
      event: event({ id: "pe::initial::home::рис", kind: "initial" }),
    };
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:00.000Z",
    });
    const insert = calls.find((c) =>
      c.sql.includes("nutrition_pantry_events"),
    )!;
    expect(insert.params[0]).toBe("pe::initial::home::рис");
  });

  it("кладе operation в outbox з тим самим id, що й локальний INSERT", async () => {
    const { client, calls } = makeRecordingClient();
    const op: NutritionDualWriteOp = {
      kind: "pantry-event-append",
      event: event({ id: "pe::initial::home::рис", kind: "initial" }),
    };
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:00.000Z",
    });
    const insert = calls.find((c) =>
      c.sql.includes("nutrition_pantry_events"),
    )!;
    expect(fireSyncOutboxUpsert).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(fireSyncOutboxUpsert).mock.calls[0]![1];
    expect(payload.table).toBe("nutrition_pantry_events");
    expect(payload.row["id"]).toBe(insert.params[0]);
  });

  it("НЕ чіпає nutrition_pantry_items — той шлях лишається за pantry-upsert", async () => {
    const { client, calls } = makeRecordingClient();
    const op: NutritionDualWriteOp = {
      kind: "pantry-event-append",
      event: event(),
    };
    await applyNutritionDualWriteOps(client, [op], {
      userId: "user_1",
      clientTs: "2026-08-01T10:00:00.000Z",
    });
    expect(
      calls.filter((c) => c.sql.includes("nutrition_pantry_items")),
    ).toEqual([]);
  });
});
