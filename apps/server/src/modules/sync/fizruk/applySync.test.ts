import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  applyFizrukCustomExercises,
  applyFizrukSets,
  applyFizrukWorkouts,
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

describe("applyFizrukWorkouts", () => {
  it("rejects invalid started_at after ownership lookup", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukWorkouts(
        asClient(fake),
        syncOp("fizruk_workouts", "insert", {
          id: "workout-1",
          user_id: "user-1",
          started_at: "not-a-date",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });
    expect(fake.queries).toHaveLength(1);
  });

  it("soft-deletes existing workouts with the client timestamp", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");
    fake.queueRows([
      { user_id: "user-1", updated_at: new Date("2026-07-21T07:00:00.000Z") },
    ]);

    await expect(
      applyFizrukWorkouts(
        asClient(fake),
        syncOp("fizruk_workouts", "delete", {
          id: "workout-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_workouts");
    expect(update.params).toEqual([clientTs, "workout-1", "user-1"]);
  });
});

describe("applyFizrukSets", () => {
  it("inserts a set with numeric defaults", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFizrukSets(
        asClient(fake),
        syncOp("fizruk_workout_sets", "insert", {
          id: "set-1",
          user_id: "user-1",
          workout_item_id: "item-1",
          sort_order: -10,
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_workout_sets");
    expect(insert.params).toEqual([
      "set-1",
      "item-1",
      "user-1",
      0,
      0,
      null,
      0,
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects invalid reps before insert", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukSets(
        asClient(fake),
        syncOp("fizruk_workout_sets", "insert", {
          id: "set-1",
          user_id: "user-1",
          workout_item_id: "item-1",
          reps: "ten",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_reps" });
    expect(fake.queries).toHaveLength(1);
  });
});

describe("applyFizrukCustomExercises", () => {
  it("rejects custom exercises without data_json", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_data_json" });
    expect(fake.queries).toHaveLength(1);
  });
});
