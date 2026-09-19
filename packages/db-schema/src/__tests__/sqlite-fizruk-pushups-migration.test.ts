/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * End-to-end прогін клієнтської міграції `007_fizruk_pushups_to_workouts`
 * на справжньому SQLite (better-sqlite3, `:memory:`).
 *
 * Снапшот-тести пінять ФОРМУ SQL (порядок statement-ів, user-scoped id);
 * цей тест пінить РЕЗУЛЬТАТ: що з рядків лічильника виходять саме такі
 * тренування, які пише `buildQuickLogWorkout`, що predicate «уже
 * перенесено» знає обидві форми id, що нулі й чужі дні не чіпаються, і що
 * таблиця після конверсії справді зникає.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { runMigrations } from "../migrate/runner.js";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import {
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
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

const UPDATED = "2026-09-10T08:00:00.000+03:00";

describe("007_fizruk_pushups_to_workouts", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    // Стан «пристрій фази 1»: усі міграції ДО 007, лічильник із даними.
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FIZRUK_CLIENT_MIGRATIONS.filter(
        (m) => m.name < "007_fizruk_pushups_to_workouts.sql",
      ),
      tableName: FIZRUK_MIGRATIONS_TABLE,
    });
    const ins = db.prepare(
      `INSERT INTO fizruk_pushups (user_id, date_key, reps, updated_at)
       VALUES (?, ?, ?, ?)`,
    );
    ins.run("u1", "2026-09-01", 20, UPDATED);
    ins.run("u1", "2026-09-02", 0, UPDATED); // нуль — переносити нічого
    ins.run("u1", "2026-09-03", 400, UPDATED); // стеля тривалості
    ins.run("u1", "2026-09-04", 15, UPDATED); // уже перенесено фазою 1
    ins.run("u2", "2026-09-01", 10, UPDATED); // той самий день, інший юзер
    // Перенос фази 1 давав id БЕЗ user_id — predicate мусить його впізнати.
    db.prepare(
      `INSERT INTO fizruk_workouts (id, user_id, started_at, ended_at, note)
       VALUES ('pushups:2026-09-04', 'u1', '2026-09-04T08:59:30.000Z',
               '2026-09-04T09:00:00.000Z', 'Перенесено з лічильника відтискань')`,
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it("конвертує дні лічильника в тренування тієї ж форми, що й швидкий запис, і знімає таблицю", async () => {
    const result = await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FIZRUK_CLIENT_MIGRATIONS,
      tableName: FIZRUK_MIGRATIONS_TABLE,
    });
    expect(result.applied).toEqual(["007_fizruk_pushups_to_workouts.sql"]);

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'fizruk_pushups'`,
      )
      .all();
    expect(tables).toEqual([]);

    const workouts = db
      .prepare(
        `SELECT id, user_id, started_at, ended_at, note, groups_json, kcal_burned
           FROM fizruk_workouts ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    expect(workouts.map((w) => w["id"])).toEqual([
      "pushups:2026-09-04", // легасі-рядок лишився, дубля для 09-04 немає
      "pushups:u1:2026-09-01",
      "pushups:u1:2026-09-03",
      "pushups:u2:2026-09-01",
    ]);

    const day1 = workouts.find((w) => w["id"] === "pushups:u1:2026-09-01")!;
    // 20 повторень → 40 с; UTC-полудень дня-ключа як мить завершення.
    expect(day1["started_at"]).toBe("2026-09-01T11:59:20.000Z");
    expect(day1["ended_at"]).toBe("2026-09-01T12:00:00.000Z");
    expect(day1["note"]).toBe("Перенесено з лічильника відтискань");
    expect(day1["groups_json"]).toBe("[]");
    expect(day1["kcal_burned"]).toBeNull();

    const day3 = workouts.find((w) => w["id"] === "pushups:u1:2026-09-03")!;
    // 400 повторень → 800 с, обрізано до стелі 10 хв.
    expect(day3["started_at"]).toBe("2026-09-03T11:50:00.000Z");

    const items = db
      .prepare(
        `SELECT id, workout_id, exercise_id, name_uk, primary_group,
                muscles_primary, muscles_secondary, type, sort_order
           FROM fizruk_workout_items ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    expect(items.map((i) => i["id"])).toEqual([
      "pushups:u1:2026-09-01_i1",
      "pushups:u1:2026-09-03_i1",
      "pushups:u2:2026-09-01_i1",
    ]);
    expect(items[0]).toMatchObject({
      workout_id: "pushups:u1:2026-09-01",
      exercise_id: "pushup",
      name_uk: "Віджимання від підлоги",
      primary_group: "chest",
      muscles_primary: '["pectoralis_major","triceps"]',
      muscles_secondary: '["serratus_anterior","front_deltoid"]',
      type: "strength",
      sort_order: 0,
    });

    const sets = db
      .prepare(
        `SELECT id, workout_item_id, user_id, weight_kg, reps
           FROM fizruk_workout_sets ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    expect(sets).toEqual([
      {
        id: "pushups:u1:2026-09-01_i1:s0",
        workout_item_id: "pushups:u1:2026-09-01_i1",
        user_id: "u1",
        weight_kg: 0,
        reps: 20,
      },
      {
        id: "pushups:u1:2026-09-03_i1:s0",
        workout_item_id: "pushups:u1:2026-09-03_i1",
        user_id: "u1",
        weight_kg: 0,
        reps: 400,
      },
      {
        id: "pushups:u2:2026-09-01_i1:s0",
        workout_item_id: "pushups:u2:2026-09-01_i1",
        user_id: "u2",
        weight_kg: 0,
        reps: 10,
      },
    ]);
  });

  it("на свіжій базі без лічильника проходить без записів", async () => {
    db.close();
    db = new Database(":memory:");
    client = syncClient(db);
    const result = await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FIZRUK_CLIENT_MIGRATIONS,
      tableName: FIZRUK_MIGRATIONS_TABLE,
    });
    expect(result.applied).toHaveLength(FIZRUK_CLIENT_MIGRATIONS.length);
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM fizruk_workouts`)
      .get() as { n: number };
    expect(count.n).toBe(0);
  });
});
