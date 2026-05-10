/**
 * Unit tests for `apps/mobile/src/modules/fizruk/lib/residualImport.ts`.
 *
 * Stage 12 / PR #057f-tombstone-mobile-stage12 of
 * `docs/planning/storage-roadmap.md`. Mirror coverage of the routine
 * residual-import test slice extended to the 6 fizruk MMKV keys
 * tombstoned to date (workouts / custom-exercises / measurements +
 * daily-log / monthly-plan / workout-templates).
 *
 * Exercises:
 *   - early-return when no fizruk MMKV keys exist (no SQLite calls);
 *   - happy path: each Stage 12 MMKV blob → diff → apply → MMKV
 *     deleted;
 *   - LWW guard: residual import does NOT clobber a newer SQLite row
 *     (existing daily-log note wins because the import uses a stale
 *     epoch-zero `clientTs`).
 */

import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";

import { migrateFizruk } from "../clientMigrate";
import { applyFizrukDualWriteOps } from "../dualWrite/adapter";
import { diffFizrukDualWriteOps } from "../dualWrite/diff";
import { importFizrukResidualFromMmkv } from "../residualImport";

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

const USER_ID = "user-fizruk-residual-stage12";
const NEW_TIMESTAMP = "2026-05-09T18:00:00.000Z";

describe("importFizrukResidualFromMmkv — Stage 12 keys", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateFizruk(client);
    _getMMKVInstance().clearAll();
  });

  afterEach(() => {
    db.close();
    _getMMKVInstance().clearAll();
  });

  it("no-ops when no fizruk MMKV keys exist", async () => {
    const result = await importFizrukResidualFromMmkv(client, USER_ID);
    expect(result).toEqual({ imported: false, cleaned: false });
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe(
      false,
    );
    expect(_getMMKVInstance().contains(MONTHLY_PLAN_STORAGE_KEY)).toBe(false);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_TEMPLATES)).toBe(
      false,
    );
  });

  it("imports a daily-log MMKV blob into SQLite and deletes the MMKV key", async () => {
    safeWriteLS(STORAGE_KEYS.FIZRUK_DAILY_LOG, [
      {
        id: "dl-1",
        at: "2026-05-09T08:00:00.000Z",
        weightKg: 80,
        sleepHours: 7,
        energyLevel: 3,
        mood: 4,
        note: "ok day",
      },
    ]);

    const result = await importFizrukResidualFromMmkv(client, USER_ID);

    expect(result.imported).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe(
      false,
    );

    const rows = await client.all<{
      id: string;
      note: string;
      sleep_hours: number | null;
    }>(
      "SELECT id, note, sleep_hours FROM fizruk_daily_log WHERE user_id = ? ORDER BY id",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("dl-1");
    expect(rows[0]?.note).toBe("ok day");
    expect(Number(rows[0]?.sleep_hours)).toBe(7);
  });

  it("imports a monthly-plan MMKV blob into SQLite and deletes the MMKV key", async () => {
    safeWriteLS(MONTHLY_PLAN_STORAGE_KEY, {
      reminderEnabled: true,
      reminderHour: 18,
      reminderMinute: 30,
      days: { "2026-05-15": { templateId: "tpl-x" } },
    });

    const result = await importFizrukResidualFromMmkv(client, USER_ID);

    expect(result.imported).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(_getMMKVInstance().contains(MONTHLY_PLAN_STORAGE_KEY)).toBe(false);

    const rows = await client.all<{ data_json: string }>(
      "SELECT data_json FROM fizruk_monthly_plan WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0]?.data_json ?? "{}");
    expect(parsed?.days?.["2026-05-15"]?.templateId).toBe("tpl-x");
    expect(parsed?.reminderHour).toBe(18);
  });

  it("imports a workout-templates MMKV blob into SQLite and deletes the MMKV key", async () => {
    safeWriteLS(STORAGE_KEYS.FIZRUK_TEMPLATES, [
      {
        id: "tpl-a",
        name: "Push day",
        exerciseIds: ["bench", "ohp"],
        groups: [],
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await importFizrukResidualFromMmkv(client, USER_ID);

    expect(result.imported).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_TEMPLATES)).toBe(
      false,
    );

    const rows = await client.all<{ id: string; name: string }>(
      "SELECT id, name FROM fizruk_workout_templates WHERE user_id = ? ORDER BY id",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("tpl-a");
    expect(rows[0]?.name).toBe("Push day");
  });

  it("drains all 3 Stage 12 keys together in a single boot", async () => {
    safeWriteLS(STORAGE_KEYS.FIZRUK_DAILY_LOG, [
      {
        id: "dl-x",
        at: "2026-05-09T08:00:00.000Z",
        weightKg: null,
        sleepHours: 6,
        energyLevel: null,
        mood: null,
        note: "",
      },
    ]);
    safeWriteLS(MONTHLY_PLAN_STORAGE_KEY, {
      reminderEnabled: false,
      reminderHour: 9,
      reminderMinute: 0,
      days: {},
    });
    safeWriteLS(STORAGE_KEYS.FIZRUK_TEMPLATES, [
      {
        id: "tpl-z",
        name: "Pull day",
        exerciseIds: [],
        groups: [],
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await importFizrukResidualFromMmkv(client, USER_ID);

    expect(result.imported).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe(
      false,
    );
    expect(_getMMKVInstance().contains(MONTHLY_PLAN_STORAGE_KEY)).toBe(false);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_TEMPLATES)).toBe(
      false,
    );

    const dl = await client.all(
      "SELECT id FROM fizruk_daily_log WHERE user_id = ?",
      [USER_ID],
    );
    const mp = await client.all(
      "SELECT user_id FROM fizruk_monthly_plan WHERE user_id = ?",
      [USER_ID],
    );
    const tpl = await client.all(
      "SELECT id FROM fizruk_workout_templates WHERE user_id = ?",
      [USER_ID],
    );
    expect(dl).toHaveLength(1);
    expect(mp).toHaveLength(1);
    expect(tpl).toHaveLength(1);
  });

  it("does NOT clobber a newer SQLite daily-log row (LWW guard)", async () => {
    // MMKV has a stale entry…
    safeWriteLS(STORAGE_KEYS.FIZRUK_DAILY_LOG, [
      {
        id: "dl-shared",
        at: "2026-05-09T08:00:00.000Z",
        weightKg: null,
        sleepHours: null,
        energyLevel: null,
        mood: null,
        note: "STALE_FROM_MMKV",
      },
    ]);

    // …but SQLite already holds a NEWER row for the same id.
    const applyResult = await applyFizrukDualWriteOps(
      client,
      diffFizrukDualWriteOps(
        {
          workouts: [],
          customExercises: [],
          measurements: [],
          dailyLog: [],
          monthlyPlan: null,
          workoutTemplates: [],
        },
        {
          workouts: [],
          customExercises: [],
          measurements: [],
          dailyLog: [
            {
              id: "dl-shared",
              at: "2026-05-09T08:00:00.000Z",
              weightKg: null,
              sleepHours: null,
              energyLevel: null,
              mood: null,
              note: "FRESH_FROM_SQLITE",
            },
          ],
          monthlyPlan: null,
          workoutTemplates: [],
        },
      ),
      { userId: USER_ID, clientTs: NEW_TIMESTAMP },
    );
    expect(applyResult.applied).toBeGreaterThan(0);

    await importFizrukResidualFromMmkv(client, USER_ID);

    const rows = await client.all<{ note: string }>(
      "SELECT note FROM fizruk_daily_log WHERE user_id = ? AND id = 'dl-shared'",
      [USER_ID],
    );
    // The fresh SQLite row wins because residual-import uses
    // `clientTs = epoch zero`.
    expect(rows[0]?.note).toBe("FRESH_FROM_SQLITE");
    // …and the MMKV key is still cleaned (table-level idempotency).
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe(
      false,
    );
  });
});
