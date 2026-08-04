import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  applyFizrukCustomExercises,
  applyFizrukMeasurements,
  applyFizrukSets,
  applyFizrukWorkouts,
} from "./applySync.js";
import { applyFizrukInjuries } from "./applyInjuries.js";

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

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", { user_id: "user-1" }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "someone-else",
          data_json: { sets: 3 },
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects tombstoned when updating an already soft-deleted row", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "delete", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
    expect(fake.queries).toHaveLength(1);
  });

  it("soft-deletes an existing row with the client timestamp", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "delete", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_custom_exercises");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([clientTs, "custom-1", "user-1"]);
  });

  it("inserts a new row, JSON-serializing data_json", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { name: "Bulgarian split squat", muscles: ["quads"] },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_custom_exercises");
    expect(insert.params).toEqual([
      "custom-1",
      "user-1",
      JSON.stringify({ name: "Bulgarian split squat", muscles: ["quads"] }),
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("updates an existing row, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { name: "renamed" },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_custom_exercises");
    expect(update.params).toEqual([
      JSON.stringify({ name: "renamed" }),
      clientTs,
      null,
      "custom-1",
      "user-1",
    ]);
  });

  it("rejects garbage created_at / deleted_at with field-specific reasons", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
          created_at: "not-a-date",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_created_at" });

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
          deleted_at: "not-a-date",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_deleted_at" });
  });
});

describe("applyFizrukMeasurements", () => {
  const clientTs = new Date("2026-07-21T08:00:00.000Z");

  function validRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "measure-1",
      user_id: "user-1",
      measured_at: "2026-07-21T06:00:00.000Z",
      weight_kg: 72.5,
      waist_cm: 80,
      chest_cm: 100,
      hips_cm: 95,
      bicep_cm: 35,
      sleep_hours: 7.5,
      energy_level: 4,
      mood: 3,
      ...overrides,
    };
  }

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ user_id: "someone-else" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a missing measured_at (NOT NULL column) with invalid_measured_at", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["measured_at"];

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", row),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_measured_at" });
  });

  it.each([
    ["weight_kg", "invalid_weight_kg"],
    ["waist_cm", "invalid_waist_cm"],
    ["chest_cm", "invalid_chest_cm"],
    ["hips_cm", "invalid_hips_cm"],
    ["bicep_cm", "invalid_bicep_cm"],
    ["sleep_hours", "invalid_sleep_hours"],
    ["energy_level", "invalid_energy_level"],
    ["mood", "invalid_mood"],
  ] as const)("rejects non-numeric %s with %s", async (field, reason) => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ [field]: "not-a-number" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason });
  });

  it("floors fractional energy_level and mood to integers", async () => {
    const fake = new FakeClient();

    await applyFizrukMeasurements(
      asClient(fake),
      syncOp(
        "fizruk_measurements",
        "insert",
        validRow({ energy_level: 4.9, mood: 2.1 }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    // params order: id, user_id, measured_at, weight_kg, waist_cm, chest_cm,
    // hips_cm, bicep_cm, sleep_hours, energy_level, mood, created_at,
    // updated_at, deleted_at
    expect(insert.params[9]).toBe(4);
    expect(insert.params[10]).toBe(2);
  });

  it("stores an absent optional measurement as null, not zero", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["weight_kg"];
    delete (row as Record<string, unknown>)["mood"];

    await applyFizrukMeasurements(
      asClient(fake),
      syncOp("fizruk_measurements", "insert", row),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[3]).toBeNull();
    expect(insert.params[10]).toBeNull();
  });

  it("inserts a new measurement with the full param set in order", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_measurements");
    expect(insert.params).toEqual([
      "measure-1",
      "user-1",
      new Date("2026-07-21T06:00:00.000Z"),
      72.5,
      80,
      100,
      95,
      35,
      7.5,
      4,
      3,
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("rejects tombstoned when updating an already soft-deleted row", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "delete", {
          id: "measure-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
  });

  it("soft-deletes an existing measurement with the client timestamp", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "delete", {
          id: "measure-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_measurements");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([clientTs, "measure-1", "user-1"]);
  });

  it("updates an existing measurement, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow({ weight_kg: 71.2 })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_measurements");
    expect(update.params).toEqual([
      new Date("2026-07-21T06:00:00.000Z"),
      71.2,
      80,
      100,
      95,
      35,
      7.5,
      4,
      3,
      clientTs,
      null,
      "measure-1",
      "user-1",
    ]);
  });
});

describe("applyFizrukInjuries", () => {
  // ADR-0083 "не можна" model — storage tested here at the apply-fn level;
  // syncV2-table-smoke.integration.test.ts covers the push→pull round trip.
  const clientTs = new Date("2026-07-21T08:00:00.000Z");

  function validRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "inj_00000005-0009-4000-8001-000000000001",
      user_id: "user-1",
      site: "spine-lumbar",
      started_at: "2026-07-20T06:00:00.000Z",
      cleared_at: null,
      ...overrides,
    };
  }

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ user_id: "someone-else" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("accepts a client-minted TEXT id that is not a bare uuid", async () => {
    // Per the high-risk note in applyInjuries.ts: `id` is `inj_<uuid>`,
    // never a bare uuid — a uuid column would 22P02 on every push. Assert
    // the apply layer does not reject on id shape.
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", validRow({ id: "inj_not_a_uuid" })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("rejects a missing site with missing_site", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["site"];

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", row),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_site" });
  });

  it("rejects a whitespace-only site with missing_site", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", validRow({ site: "   " })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_site" });
  });

  it("rejects a missing/invalid started_at with invalid_started_at", async () => {
    const fake = new FakeClient();
    const missing = validRow();
    delete (missing as Record<string, unknown>)["started_at"];

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", missing),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ started_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });
  });

  it("rejects an unparseable cleared_at with invalid_cleared_at", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ cleared_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_cleared_at" });
  });

  it("never coerces an absent cleared_at to clientTs — null keeps the mark ACTIVE", async () => {
    // The exact regression called out in applyInjuries.ts: coercing a
    // missing cleared_at to clientTs would silently clear the injury.
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["cleared_at"];

    await applyFizrukInjuries(
      asClient(fake),
      syncOp("fizruk_injuries", "insert", row),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    // params order: id, user_id, site, started_at, cleared_at, note,
    // created_at, updated_at, deleted_at
    expect(insert.params[4]).toBeNull();
  });

  it("stores an explicit cleared_at when the client marks the injury resolved", async () => {
    const fake = new FakeClient();

    await applyFizrukInjuries(
      asClient(fake),
      syncOp(
        "fizruk_injuries",
        "insert",
        validRow({ cleared_at: "2026-07-25T09:00:00.000Z" }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[4]).toEqual(new Date("2026-07-25T09:00:00.000Z"));
  });

  it("trims the site and defaults note to an empty string", async () => {
    const fake = new FakeClient();

    await applyFizrukInjuries(
      asClient(fake),
      syncOp(
        "fizruk_injuries",
        "insert",
        validRow({ site: "  spine-lumbar  " }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[2]).toBe("spine-lumbar");
    expect(insert.params[5]).toBe("");
  });

  it("inserts a new injury with the full param set in order", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ note: "aggravated during squats" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_injuries");
    expect(insert.params).toEqual([
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
      "spine-lumbar",
      new Date("2026-07-20T06:00:00.000Z"),
      null,
      "aggravated during squats",
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("rejects tombstoned when updating an already soft-deleted row", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
  });

  it("soft-deletes an existing injury with the client timestamp", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_injuries");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([
      clientTs,
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
    ]);
  });

  it("allows deleting a row that is already tombstoned (idempotent retract)", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("updates an existing injury, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "update",
          validRow({
            cleared_at: "2026-07-22T09:00:00.000Z",
            note: "resolved after rest",
          }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_injuries");
    expect(update.params).toEqual([
      "spine-lumbar",
      new Date("2026-07-20T06:00:00.000Z"),
      new Date("2026-07-22T09:00:00.000Z"),
      "resolved after rest",
      clientTs,
      null,
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
    ]);
  });
});
