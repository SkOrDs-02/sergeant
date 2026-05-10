/**
 * Mobile-side adapter tests for the Stage 12 Fizruk dual-write
 * extensions (`daily-log`, `monthly-plan`, `workout-template` ops).
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/adapter.test.ts`
 * but uses Jest + `better-sqlite3`, matching the mobile Routine /
 * Nutrition test rigs. The Stage 1–11 ops (workout / measurement /
 * custom-exercise) are already covered by the existing mobile suites
 * — this file focuses on the new ops introduced by PR #070f-mobile-dualwrite.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateFizruk } from "../../clientMigrate";
import { applyFizrukDualWriteOps } from "../adapter";
import type { FizrukDualWriteOp } from "../diff";

function syncClient(db: ReturnType<typeof Database>): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const TS2 = "2026-05-01T11:00:00.000Z";
const silentLogger = () => {};

describe("applyFizrukDualWriteOps — Stage 12 ops (mobile, better-sqlite3)", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateFizruk(client);
  });

  afterEach(() => {
    db.close();
  });

  // --- Daily log ----------------------------------------------------------

  it("upserts a daily-log entry with all scalar fields", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "daily-log-upsert",
        entry: {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80.5,
          sleepHours: 7.5,
          energyLevel: 7,
          mood: 4,
          note: "feeling great",
        },
      },
    ];
    const result = await applyFizrukDualWriteOps(client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_daily_log WHERE id = ?",
      ["d1"],
    ) as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(UID);
    expect(rows[0]!.entry_at).toBe("2026-05-01T07:00:00Z");
    expect(rows[0]!.weight_kg).toBe(80.5);
    expect(rows[0]!.sleep_hours).toBe(7.5);
    expect(rows[0]!.energy_level).toBe(7);
    expect(rows[0]!.mood).toBe(4);
    expect(rows[0]!.note).toBe("feeling great");
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it("soft-deletes a daily-log entry with the apply timestamp", async () => {
    const upsertOps: FizrukDualWriteOp[] = [
      {
        kind: "daily-log-upsert",
        entry: {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(client, upsertOps, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const result = await applyFizrukDualWriteOps(
      client,
      [{ kind: "daily-log-delete", entryId: "d1" }],
      { userId: UID, clientTs: TS2, logger: silentLogger },
    );
    expect(result.applied).toBe(1);

    const after = client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_daily_log WHERE id = ?",
      ["d1"],
    ) as unknown as Record<string, unknown>[];
    expect(after[0]!.deleted_at).toBe(TS2);
  });

  it("LWW guard: stale daily-log upsert does not overwrite newer row", async () => {
    const newer: FizrukDualWriteOp[] = [
      {
        kind: "daily-log-upsert",
        entry: {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "newer",
        },
      },
    ];
    await applyFizrukDualWriteOps(client, newer, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const stale: FizrukDualWriteOp[] = [
      {
        kind: "daily-log-upsert",
        entry: {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 60,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "stale",
        },
      },
    ];
    await applyFizrukDualWriteOps(client, stale, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const rows = client.all<Record<string, unknown>>(
      "SELECT note, weight_kg FROM fizruk_daily_log WHERE id = ?",
      ["d1"],
    ) as unknown as Record<string, unknown>[];
    expect(rows[0]!.note).toBe("newer");
    expect(rows[0]!.weight_kg).toBe(80);
  });

  // --- Monthly plan -------------------------------------------------------

  it("inserts a monthly-plan singleton row on first set", async () => {
    const result = await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "monthly-plan-set",
          monthlyPlan: { dataJson: '{"days":{}}' },
        },
      ],
      { userId: UID, clientTs: TS1, logger: silentLogger },
    );
    expect(result.applied).toBe(1);

    const rows = client.all<Record<string, unknown>>(
      "SELECT user_id, data_json, updated_at FROM fizruk_monthly_plan WHERE user_id = ?",
      [UID],
    ) as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data_json).toBe('{"days":{}}');
    expect(rows[0]!.updated_at).toBe(TS1);
  });

  it("updates monthly-plan blob on subsequent sets", async () => {
    await applyFizrukDualWriteOps(
      client,
      [{ kind: "monthly-plan-set", monthlyPlan: { dataJson: '{"a":1}' } }],
      { userId: UID, clientTs: TS1, logger: silentLogger },
    );
    await applyFizrukDualWriteOps(
      client,
      [{ kind: "monthly-plan-set", monthlyPlan: { dataJson: '{"a":2}' } }],
      { userId: UID, clientTs: TS2, logger: silentLogger },
    );

    const rows = client.all<Record<string, unknown>>(
      "SELECT data_json, updated_at FROM fizruk_monthly_plan WHERE user_id = ?",
      [UID],
    ) as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data_json).toBe('{"a":2}');
    expect(rows[0]!.updated_at).toBe(TS2);
  });

  it("LWW guard: stale monthly-plan set does not overwrite newer blob", async () => {
    await applyFizrukDualWriteOps(
      client,
      [{ kind: "monthly-plan-set", monthlyPlan: { dataJson: '{"v":"new"}' } }],
      { userId: UID, clientTs: TS2, logger: silentLogger },
    );
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "monthly-plan-set",
          monthlyPlan: { dataJson: '{"v":"stale"}' },
        },
      ],
      { userId: UID, clientTs: TS1, logger: silentLogger },
    );

    const rows = client.all<Record<string, unknown>>(
      "SELECT data_json FROM fizruk_monthly_plan WHERE user_id = ?",
      [UID],
    ) as unknown as Record<string, unknown>[];
    expect(rows[0]!.data_json).toBe('{"v":"new"}');
  });

  // --- Workout templates --------------------------------------------------

  it("upserts a workout-template with serialized exerciseIds + groups", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-template-upsert",
        template: {
          id: "t1",
          name: "Push day",
          exerciseIds: ["bench-press", "shoulder-press"],
          groups: [{ id: "g1", itemIds: ["bench-press"] }],
          updatedAt: TS1,
          lastUsedAt: null,
        },
      },
    ];
    const result = await applyFizrukDualWriteOps(client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workout_templates WHERE id = ?",
      ["t1"],
    ) as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Push day");
    expect(JSON.parse(rows[0]!.exercise_ids_json as string)).toEqual([
      "bench-press",
      "shoulder-press",
    ]);
    expect(JSON.parse(rows[0]!.groups_json as string)).toEqual([
      { id: "g1", itemIds: ["bench-press"] },
    ]);
    expect(rows[0]!.last_used_at).toBeNull();
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it("soft-deletes a workout-template", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "workout-template-upsert",
          template: {
            id: "t1",
            name: "Pull day",
            exerciseIds: [],
            groups: [],
            updatedAt: TS1,
          },
        },
      ],
      { userId: UID, clientTs: TS1, logger: silentLogger },
    );

    const result = await applyFizrukDualWriteOps(
      client,
      [{ kind: "workout-template-delete", templateId: "t1" }],
      { userId: UID, clientTs: TS2, logger: silentLogger },
    );
    expect(result.applied).toBe(1);

    const after = client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_workout_templates WHERE id = ?",
      ["t1"],
    ) as unknown as Record<string, unknown>[];
    expect(after[0]!.deleted_at).toBe(TS2);
  });

  it("LWW guard: stale workout-template upsert is a no-op", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "workout-template-upsert",
          template: {
            id: "t1",
            name: "Newer",
            exerciseIds: [],
            groups: [],
            updatedAt: TS2,
          },
        },
      ],
      { userId: UID, clientTs: TS2, logger: silentLogger },
    );
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "workout-template-upsert",
          template: {
            id: "t1",
            name: "Stale",
            exerciseIds: [],
            groups: [],
            updatedAt: TS1,
          },
        },
      ],
      { userId: UID, clientTs: TS1, logger: silentLogger },
    );

    const rows = client.all<Record<string, unknown>>(
      "SELECT name FROM fizruk_workout_templates WHERE id = ?",
      ["t1"],
    ) as unknown as Record<string, unknown>[];
    expect(rows[0]!.name).toBe("Newer");
  });
});
