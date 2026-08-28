import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { NAME_MAX_LEN, NOTE_MAX_LEN } from "@sergeant/shared";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  applyNutritionMeals,
  applyNutritionPantries,
  applyNutritionPantryItems,
  applyNutritionPrefs,
} from "./applySync.js";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly queuedRows: unknown[][] = [];

  queueRows(rows: unknown[]): void {
    this.queuedRows.push(rows);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      return { rows: (this.queuedRows.shift() ?? []) as T[] };
    }
    return { rows: [] };
  }
}

function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

function syncOp(
  table: string,
  kind: SyncV2Op["op"],
  row: Record<string, unknown>,
): SyncV2Op {
  return { op: kind, table, row } as SyncV2Op;
}

function lastQuery(fake: FakeClient): RecordedQuery {
  const query = fake.queries[fake.queries.length - 1];
  if (!query) throw new Error("expected a recorded query");
  return query;
}

describe("applyNutritionMeals", () => {
  it("rejects invalid macro values before DML", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionMeals(
        asClient(fake),
        syncOp("nutrition_meals", "insert", {
          id: "meal-1",
          user_id: "user-1",
          eaten_at: "2026-07-21T08:00:00.000Z",
          name: "omelette",
          kcal: 320,
          protein_g: "a lot",
        }),
        "user-1",
        new Date("2026-07-21T08:05:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_protein_g" });
    expect(fake.queries).toHaveLength(1);
  });

  it("inserts meals with defaults and numeric demo coercion", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:05:00.000Z");

    await expect(
      applyNutritionMeals(
        asClient(fake),
        syncOp("nutrition_meals", "insert", {
          id: "meal-1",
          user_id: "user-1",
          eaten_at: "2026-07-21T08:00:00.000Z",
          name: "omelette",
          kcal: 320,
          is_demo: 1,
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO nutrition_meals");
    expect(insert.params).toEqual([
      "meal-1",
      "user-1",
      new Date("2026-07-21T08:00:00.000Z"),
      "snack",
      "omelette",
      "",
      320,
      null,
      null,
      null,
      "manual",
      "manual",
      null,
      null,
      true,
      clientTs,
      clientTs,
      null,
    ]);
  });

  // Pre-beta input-boundaries audit: `curl` bypasses the client-side
  // NAME_MAX_LEN guard — the server must reject before any DML.
  it("rejects a name longer than NAME_MAX_LEN before DML", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionMeals(
        asClient(fake),
        syncOp("nutrition_meals", "insert", {
          id: "meal-1",
          user_id: "user-1",
          eaten_at: "2026-07-21T08:00:00.000Z",
          name: "a".repeat(NAME_MAX_LEN + 1),
        }),
        "user-1",
        new Date("2026-07-21T08:05:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "text_too_long" });
    expect(fake.queries).toHaveLength(1);
  });

  it("accepts a name at exactly NAME_MAX_LEN", async () => {
    const fake = new FakeClient();
    const name = "a".repeat(NAME_MAX_LEN);

    await expect(
      applyNutritionMeals(
        asClient(fake),
        syncOp("nutrition_meals", "insert", {
          id: "meal-1",
          user_id: "user-1",
          eaten_at: "2026-07-21T08:00:00.000Z",
          name,
        }),
        "user-1",
        new Date("2026-07-21T08:05:00.000Z"),
      ),
    ).resolves.toEqual({ status: "applied" });
  });
});

describe("applyNutritionPantryItems", () => {
  it("rejects pantry items without a pantry id", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionPantryItems(
        asClient(fake),
        syncOp("nutrition_pantry_items", "insert", {
          id: "item-1",
          user_id: "user-1",
          name: "oats",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_pantry_id" });
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects a name longer than NAME_MAX_LEN", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionPantryItems(
        asClient(fake),
        syncOp("nutrition_pantry_items", "insert", {
          id: "item-1",
          user_id: "user-1",
          pantry_id: "home",
          name: "a".repeat(NAME_MAX_LEN + 1),
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "text_too_long" });
  });

  it("rejects notes longer than NOTE_MAX_LEN even when name is fine", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionPantryItems(
        asClient(fake),
        syncOp("nutrition_pantry_items", "insert", {
          id: "item-1",
          user_id: "user-1",
          pantry_id: "home",
          name: "oats",
          notes: "a".repeat(NOTE_MAX_LEN + 1),
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "text_too_long" });
  });
});

describe("applyNutritionPrefs", () => {
  it("rejects deletes for the singleton prefs row", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionPrefs(
        asClient(fake),
        syncOp("nutrition_prefs", "delete", { user_id: "user-1" }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "delete_not_supported" });
    expect(fake.queries).toHaveLength(0);
  });

  it("upserts default prefs JSON when the client omits optional fields", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyNutritionPrefs(
        asClient(fake),
        syncOp("nutrition_prefs", "update", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO nutrition_prefs");
    expect(insert.params).toEqual(["user-1", "{}", null, clientTs, clientTs]);
  });
});

/**
 * Комора мовчки не синхронізувалась ні в кого, крім однієї людини в системі.
 *
 * `makeDefaultPantry()` віддає КОЖНОМУ користувачу комору з id `home`, а id
 * позиції — це `<pantryId>::<index>::<name>`. Обидва не унікальні між
 * користувачами. Поки PK був глобальним, а lookup ішов по голому
 * `WHERE id = $1`, перший користувач, чия комора доїхала до сервера, «займав»
 * `home` назавжди: у всіх наступних запит знаходив ЧУЖИЙ рядок і повертав
 * `fk_violation`, клієнт позначав аутбокс термінально відхиленим, і комора
 * лишалась локальною без жодного сигналу. Прод: SERGEANT-WEB-T, серпень 2026.
 *
 * Міграція 129 зробила PK композитним `(user_id, id)`; ці тести стережуть
 * другу половину фікса — що lookup звужений по користувачу.
 */
describe("комора: lookup звужений по користувачу (міграція 129)", () => {
  it("applyNutritionPantries шукає комору по парі (id, user_id)", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-08-28T10:00:00.000Z");

    await expect(
      applyNutritionPantries(
        asClient(fake),
        syncOp("nutrition_pantries", "insert", {
          id: "home",
          user_id: "user-2",
          name: "Дім",
          text: "",
        }),
        "user-2",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const select = fake.queries[0];
    expect(select?.sql).toContain("FROM nutrition_pantries");
    expect(select?.sql).toContain("user_id = $2");
    expect(select?.params).toEqual(["home", "user-2"]);
  });

  it("чужа комора з тим самим id більше не блокує вставку", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-08-28T10:00:00.000Z");
    // Рядок `home` користувача user-1 у базі є, але user-scoped SELECT його не
    // бачить — саме тому черга порожня. Раніше той самий стан давав
    // `fk_violation`; тепер user-2 отримує ВЛАСНИЙ рядок.
    await expect(
      applyNutritionPantries(
        asClient(fake),
        syncOp("nutrition_pantries", "insert", {
          id: "home",
          user_id: "user-2",
          name: "Дім",
          text: "",
        }),
        "user-2",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO nutrition_pantries");
    expect(insert.params[0]).toBe("home");
    expect(insert.params[1]).toBe("user-2");
  });

  it("власна комора користувача так само лишається під LWW-захистом", async () => {
    const fake = new FakeClient();
    // Свіжіший серверний рядок цього ж користувача — локальна правка програє.
    fake.queueRows([
      {
        updated_at: new Date("2026-08-28T12:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyNutritionPantries(
        asClient(fake),
        syncOp("nutrition_pantries", "insert", {
          id: "home",
          user_id: "user-2",
          name: "Дім",
          text: "",
        }),
        "user-2",
        new Date("2026-08-28T10:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyNutritionPantryItems шукає позицію по парі (id, user_id)", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-08-28T10:00:00.000Z");

    await expect(
      applyNutritionPantryItems(
        asClient(fake),
        syncOp("nutrition_pantry_items", "insert", {
          id: "home::0::Молоко",
          user_id: "user-2",
          pantry_id: "home",
          name: "Молоко",
        }),
        "user-2",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const select = fake.queries[0];
    expect(select?.sql).toContain("FROM nutrition_pantry_items");
    expect(select?.sql).toContain("user_id = $2");
    expect(select?.params).toEqual(["home::0::Молоко", "user-2"]);

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO nutrition_pantry_items");
    expect(insert.params[0]).toBe("home::0::Молоко");
    expect(insert.params[2]).toBe("user-2");
  });

  it("op від імені чужого user_id усе одно відкидається до будь-якого DML", async () => {
    const fake = new FakeClient();

    await expect(
      applyNutritionPantries(
        asClient(fake),
        syncOp("nutrition_pantries", "insert", {
          id: "home",
          user_id: "user-1",
          name: "Дім",
          text: "",
        }),
        "user-2",
        new Date("2026-08-28T10:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });
});
