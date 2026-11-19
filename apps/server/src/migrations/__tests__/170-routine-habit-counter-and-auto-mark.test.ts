// Міграція 170 - лічильник звички і привʼязка автовідмітки в Рутині
// (спека routine-counter-automark-percent-and-hub-rows, Р-1 (а) і (в),
// відповіді founder-а 2026-11-18 у § 11.9 розбору teardown).
//
// Два лейни, як у `168-notification-quiet-hours.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: лише ADD nullable і нова таблиця, CHECK-и з
//    іменами, три фіксовані джерела автовідмітки, down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: CHECK-и
//    відкидають погані значення, up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "170_routine_habit_counter_and_auto_mark.sql";
const DOWN_FILE = "170_routine_habit_counter_and_auto_mark.down.sql";
const TIMEOUT_MS = 180_000;
const AUTO_MARK_SOURCES = [
  "fizruk_workout",
  "nutrition_water_goal",
  "finyk_expense",
] as const;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("170 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("routine_habits: три nullable колонки без дефолтів", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS count_target INTEGER\b/);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS count_unit TEXT\b/);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS auto_mark_source TEXT\b/);
    // Nullable: старі клієнти не шлють полів, рядок лишається «так/ні».
    expect(body).not.toMatch(/count_target INTEGER NOT NULL/);
    expect(body).not.toMatch(/auto_mark_source TEXT NOT NULL/);
  });

  it("CHECK цілі ≥ 1 і рівно три джерела автовідмітки", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /routine_habits_count_target_check CHECK \(count_target IS NULL OR count_target >= 1\)/,
    );
    const check = body.match(
      /routine_habits_auto_mark_source_check CHECK \(([^;]*)\);/,
    );
    expect(check).not.toBeNull();
    for (const s of AUTO_MARK_SOURCES) expect(check![1]).toContain(`'${s}'`);
    expect(check![1]!.match(/'[a-z_]+'/g)).toHaveLength(3);
  });

  it("routine_habit_counts за формою 098 після 162: PK (user_id, id), soft-delete, LWW", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS routine_habit_counts \(/);
    expect(body).toMatch(
      /user_id\s+TEXT NOT NULL REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
    expect(body).toMatch(/habit_id\s+TEXT NOT NULL/);
    expect(body).toMatch(/date_key\s+TEXT NOT NULL/);
    expect(body).toMatch(
      /count\s+INTEGER NOT NULL\s+CONSTRAINT routine_habit_counts_count_check CHECK \(count >= 0\)/,
    );
    expect(body).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    expect(body).toMatch(/deleted_at\s+TIMESTAMPTZ,/);
    expect(body).toMatch(/PRIMARY KEY \(user_id, id\)/);
    expect(body).toMatch(
      /CREATE INDEX IF NOT EXISTS routine_habit_counts_user_habit_idx\s+ON routine_habit_counts \(user_id, habit_id\)/,
    );
  });

  it("additive: без DROP і без дефолтів, що переписують routine_habits", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/ALTER TABLE routine_habits[^;]*DEFAULT/);
  });

  it("«знято сьогодні» в схемі немає (памʼять пристрою)", () => {
    expect(statementsOnly(up)).not.toMatch(/suppress/i);
  });

  it("down прибирає таблицю і три колонки, не чіпаючи сусідів", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(/DROP TABLE IF EXISTS routine_habit_counts/);
    for (const col of ["auto_mark_source", "count_unit", "count_target"]) {
      expect(body).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}\\b`));
    }
    expect(body).not.toMatch(/pause_intervals|weekly_target_history|paused/);
  });
});

describe("170 - живий Postgres", () => {
  let container: StartedTestContainer | null = null;
  let pool: pg.Pool | null = null;
  let dockerAvailable = false;

  beforeAll(async () => {
    try {
      container = await new GenericContainer("pgvector/pgvector:pg17")
        .withEnvironment({
          POSTGRES_USER: "hub",
          POSTGRES_PASSWORD: "hub",
          POSTGRES_DB: "hub_test",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(
          Wait.forLogMessage(
            /database system is ready to accept connections/,
            2,
          ),
        )
        .start();
      pool = new pg.Pool({
        connectionString: `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`,
        max: 4,
      });
      const files = (await fs.readdir(MIGRATIONS_DIR))
        .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
        .sort();
      for (const f of files) {
        const sql = (
          await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf8")
        ).trim();
        if (sql) await pool.query(sql);
      }
      dockerAvailable = true;
    } catch (e) {
      console.warn(
        `[170-routine-habit-counter] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("наявна звичка лишається «так/ні», CHECK-и відкидають погані значення", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('rc-u1', 'rc-u1', 'rc-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO routine_habits (id, user_id, name) VALUES ('h1', 'rc-u1', 'Вода')`,
    );
    const r = await pool!.query(
      `SELECT count_target, count_unit, auto_mark_source
         FROM routine_habits WHERE user_id = 'rc-u1' AND id = 'h1'`,
    );
    expect(r.rows[0]).toEqual({
      count_target: null,
      count_unit: null,
      auto_mark_source: null,
    });
    for (const s of AUTO_MARK_SOURCES) {
      await pool!.query(
        `UPDATE routine_habits SET auto_mark_source = $1 WHERE id = 'h1'`,
        [s],
      );
    }
    await expect(
      pool!.query(
        `UPDATE routine_habits SET auto_mark_source = 'fizruk' WHERE id = 'h1'`,
      ),
    ).rejects.toThrow(/routine_habits_auto_mark_source_check/);
    await expect(
      pool!.query(`UPDATE routine_habits SET count_target = 0 WHERE id = 'h1'`),
    ).rejects.toThrow(/routine_habits_count_target_check/);
    await pool!.query(
      `INSERT INTO routine_habit_counts (id, user_id, habit_id, date_key, count)
       VALUES ('h1__2026-11-18', 'rc-u1', 'h1', '2026-11-18', 2)`,
    );
    await expect(
      pool!.query(
        `INSERT INTO routine_habit_counts (id, user_id, habit_id, date_key, count)
         VALUES ('h1__2026-11-17', 'rc-u1', 'h1', '2026-11-17', -1)`,
      ),
    ).rejects.toThrow(/routine_habit_counts_count_check/);
  });

  it("up -> down -> up: таблиця і колонки зникають і повертаються", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const columns = async () =>
      (
        await pool!.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = 'routine_habits'`,
        )
      ).rows.map((r) => r.column_name);
    await pool!.query(down);
    const after = await columns();
    expect(after).not.toContain("count_target");
    expect(after).not.toContain("auto_mark_source");
    expect(after).toContain("pause_intervals");
    const t = await pool!.query(
      `SELECT to_regclass('routine_habit_counts') AS t`,
    );
    expect(t.rows[0].t).toBeNull();
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    expect(await columns()).toContain("auto_mark_source");
  });
});
