import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  applyNutritionMeals,
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
