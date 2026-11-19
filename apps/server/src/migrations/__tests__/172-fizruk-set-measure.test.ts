// Міграція 172 - секунди й метри на кожен підхід і тип виміру вправи
// (спека fizruk-exercise-measure-type, міграція А).
//
// Два лейни, як у `171-fizruk-workout-program-ref.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: три nullable колонки з CHECK, без індексу і
//    без DROP; down прибирає рівно своє і не чіпає однойменні колонки
//    `fizruk_workout_items` з 029.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: наявний
//    підхід лишається NULL, CHECK-и відкидають відʼємне і чужу форму,
//    бекфіл із `sync_op_log` (останній оп по ключу, невалідне -> NULL,
//    повтор no-op), up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "172_fizruk_set_measure.sql";
const DOWN_FILE = "172_fizruk_set_measure.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("172 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("підходи: duration_sec і distance_m, nullable з CHECK >= 0", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/ALTER TABLE fizruk_workout_sets/);
    expect(body).toMatch(
      /ADD COLUMN IF NOT EXISTS duration_sec INTEGER\s+CONSTRAINT fizruk_workout_sets_duration_sec_check CHECK \(duration_sec >= 0\),/,
    );
    expect(body).toMatch(
      /ADD COLUMN IF NOT EXISTS distance_m INTEGER\s+CONSTRAINT fizruk_workout_sets_distance_m_check CHECK \(distance_m >= 0\);/,
    );
  });

  it("вправа тренування: measure TEXT з CHECK на форму ідентифікатора", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/ALTER TABLE fizruk_workout_items/);
    expect(body).toMatch(
      /ADD COLUMN IF NOT EXISTS measure TEXT\s+CONSTRAINT fizruk_workout_items_measure_check CHECK \(measure ~ '\^\[a-z_\]\{1,32\}\$'\);/,
    );
  });

  it("additive: без NOT NULL, DEFAULT, DROP COLUMN/TABLE і індексу", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/ADD COLUMN[^,;]*(NOT NULL|DEFAULT)/);
    expect(body).not.toMatch(/\bDROP\s+(COLUMN|TABLE)\b/i);
    expect(body).not.toMatch(/CREATE\s+INDEX/i);
  });

  it("бекфіл: вибірка з журналу ДО ALTER, лише applied insert/update", () => {
    const body = statementsOnly(up);
    const firstScan = body.indexOf("FROM sync_op_log");
    const firstAlter = body.indexOf("ALTER TABLE");
    expect(firstScan).toBeGreaterThan(-1);
    expect(firstScan).toBeLessThan(firstAlter);
    expect(
      body.match(/CREATE TEMP TABLE m172_\w+ ON COMMIT DROP AS/g),
    ).toHaveLength(2);
    expect(body.match(/l\.status = 'applied'/g)).toHaveLength(2);
    expect(body.match(/l\.op IN \('insert', 'update'\)/g)).toHaveLength(2);
    expect(body.match(/client_ts DESC, (op_id|l\.id) DESC/g)).toHaveLength(3);
  });

  it("бекфіл: межі хендлера і лише NULL-колонки (повторний прогін no-op)", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/<= 86400/);
    expect(body).toMatch(/<= 1000000/);
    expect(body).toMatch(
      /IN \('weight_reps', 'reps', 'weight_time', 'time',\s+'weight_distance', 'distance_time'\)/,
    );
    expect(body).toMatch(/COALESCE\(s\.duration_sec, b\.duration_sec\)/);
    expect(body).toMatch(/COALESCE\(s\.distance_m, b\.distance_m\)/);
    expect(body).toMatch(/AND i\.measure IS NULL/);
    const lastAlter = body.lastIndexOf("ALTER TABLE");
    expect(body.indexOf("UPDATE fizruk_workout_sets")).toBeGreaterThan(
      lastAlter,
    );
  });

  it("COMMENT ON COLUMN на всі три колонки", () => {
    for (const col of [
      "fizruk_workout_sets\\.duration_sec",
      "fizruk_workout_sets\\.distance_m",
      "fizruk_workout_items\\.measure",
    ]) {
      expect(up).toMatch(new RegExp(`COMMENT ON COLUMN ${col} IS`));
    }
  });

  it("down прибирає три колонки, не чіпаючи колонки вправи з 029", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(
      /ALTER TABLE fizruk_workout_items DROP COLUMN IF EXISTS measure;/,
    );
    expect(body).toMatch(
      /ALTER TABLE fizruk_workout_sets\s+DROP COLUMN IF EXISTS distance_m,\s+DROP COLUMN IF EXISTS duration_sec;/,
    );
    const itemsStatement = body
      .split(";")
      .find((stmt) => stmt.includes("ALTER TABLE fizruk_workout_items"));
    expect(itemsStatement).not.toMatch(/duration_sec|distance_m/);
  });
});

describe("172 - живий Postgres", () => {
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
        `[172-fizruk-set-measure] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("наявний підхід лишається NULL, CHECK-и відкидають відʼємне і чужу форму", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('sm-u1', 'sm-u1', 'sm-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workouts (id, user_id, started_at)
       VALUES ('w1', 'sm-u1', NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workout_items (id, workout_id, user_id, exercise_id, name_uk)
       VALUES ('i1', 'w1', 'sm-u1', 'plank', 'Планка')`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workout_sets (id, workout_item_id, user_id)
       VALUES ('s1', 'i1', 'sm-u1')`,
    );
    const set = await pool!.query(
      `SELECT duration_sec, distance_m FROM fizruk_workout_sets WHERE id = 's1'`,
    );
    expect(set.rows[0]).toEqual({ duration_sec: null, distance_m: null });
    const item = await pool!.query(
      `SELECT measure FROM fizruk_workout_items WHERE id = 'i1'`,
    );
    expect(item.rows[0]).toEqual({ measure: null });

    await pool!.query(
      `UPDATE fizruk_workout_sets SET duration_sec = 60, distance_m = 0 WHERE id = 's1'`,
    );
    await pool!.query(
      `UPDATE fizruk_workout_items SET measure = 'time' WHERE id = 'i1'`,
    );
    await expect(
      pool!.query(
        `UPDATE fizruk_workout_sets SET duration_sec = -1 WHERE id = 's1'`,
      ),
    ).rejects.toThrow(/fizruk_workout_sets_duration_sec_check/);
    await expect(
      pool!.query(
        `UPDATE fizruk_workout_sets SET distance_m = -1 WHERE id = 's1'`,
      ),
    ).rejects.toThrow(/fizruk_workout_sets_distance_m_check/);
    await expect(
      pool!.query(
        `UPDATE fizruk_workout_items SET measure = 'WEIGHT' WHERE id = 'i1'`,
      ),
    ).rejects.toThrow(/fizruk_workout_items_measure_check/);
  });

  it("бекфіл із журналу: останній оп по ключу, невалідне пропускається, повтор no-op", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const q = (sql: string, params: unknown[] = []) => pool!.query(sql, params);
    // Стан «старий сервер»: колонок ще немає, рядки є, оп-и в журналі.
    await q(down);
    const sets = ["bs1", "bs2", "bs3", "bs4", "bs5"];
    for (const id of sets) {
      await q(
        `INSERT INTO fizruk_workout_sets (id, workout_item_id, user_id)
         VALUES ($1, 'i1', 'sm-u1')`,
        [id],
      );
    }
    await q(
      `INSERT INTO fizruk_workout_items (id, workout_id, user_id, exercise_id, name_uk)
       VALUES ('bi1', 'w1', 'sm-u1', 'run', 'Біг'), ('bi2', 'w1', 'sm-u1', 'row', 'Гребля')`,
    );
    let n = 0;
    const op = (
      table: string,
      row: Record<string, unknown>,
      ts: string,
      status = "applied",
      kind = "update",
    ) =>
      q(
        `INSERT INTO sync_op_log
           (user_id, idempotency_key, table_name, op, row, client_ts, status)
         VALUES ('sm-u1', $1, $2, $3, $4, $5, $6)`,
        [`k${++n}`, table, kind, JSON.stringify(row), ts, status],
      );
    const T = "fizruk_workout_sets";
    // bs1: три оп-и, береться останній за client_ts; старий без ключів не затирає.
    await op(
      T,
      { id: "bs1", duration_sec: 30 },
      "2026-11-18T10:00:00Z",
      "applied",
      "insert",
    );
    await op(
      T,
      { id: "bs1", duration_sec: 45, distance_m: 100 },
      "2026-11-18T10:05:00Z",
    );
    await op(T, { id: "bs1", reps: 3 }, "2026-11-18T10:06:00Z");
    // bs2: оп без ключів -> нічого.
    await op(T, { id: "bs2", reps: 5 }, "2026-11-18T10:00:00Z");
    // bs3: невалідні значення -> пропуск, міграція не падає.
    await op(
      T,
      { id: "bs3", duration_sec: -1, distance_m: "abc" },
      "2026-11-18T10:00:00Z",
    );
    // bs4: rejected-оп не рахується; числовий рядок і дріб -> floor.
    await op(
      T,
      { id: "bs4", duration_sec: 999 },
      "2026-11-18T11:00:00Z",
      "rejected",
    );
    await op(
      T,
      { id: "bs4", duration_sec: "61.7", distance_m: 2000000 },
      "2026-11-18T10:00:00Z",
    );
    // bs5: останній оп явно очищає ключ -> NULL.
    await op(T, { id: "bs5", duration_sec: 20 }, "2026-11-18T10:00:00Z");
    await op(T, { id: "bs5", duration_sec: null }, "2026-11-18T10:01:00Z");
    const I = "fizruk_workout_items";
    await op(I, { id: "bi1", measure: "time" }, "2026-11-18T10:00:00Z");
    await op(
      I,
      { id: "bi1", measure: "distance_time" },
      "2026-11-18T10:02:00Z",
    );
    await op(I, { id: "bi2", measure: "WEIGHT" }, "2026-11-18T10:00:00Z");

    await q(up);
    const setRows = async () =>
      (
        await q(
          `SELECT id, duration_sec, distance_m FROM fizruk_workout_sets
            WHERE id = ANY($1) ORDER BY id`,
          [sets],
        )
      ).rows;
    expect(await setRows()).toEqual([
      { id: "bs1", duration_sec: 45, distance_m: 100 },
      { id: "bs2", duration_sec: null, distance_m: null },
      { id: "bs3", duration_sec: null, distance_m: null },
      { id: "bs4", duration_sec: 61, distance_m: null },
      { id: "bs5", duration_sec: null, distance_m: null },
    ]);
    const itemRows = async () =>
      (
        await q(
          `SELECT id, measure FROM fizruk_workout_items
            WHERE id IN ('bi1', 'bi2') ORDER BY id`,
        )
      ).rows;
    expect(await itemRows()).toEqual([
      { id: "bi1", measure: "distance_time" },
      { id: "bi2", measure: null },
    ]);

    // Уже заповнену колонку бекфіл не чіпає; повторний прогін нічого не міняє.
    await q(`UPDATE fizruk_workout_sets SET duration_sec = 7 WHERE id = 'bs1'`);
    const before = await setRows();
    await q(up);
    const after = await setRows();
    expect(after).toEqual(before);
    expect(after[0]).toEqual({ id: "bs1", duration_sec: 7, distance_m: 100 });
    expect(await itemRows()).toEqual([
      { id: "bi1", measure: "distance_time" },
      { id: "bi2", measure: null },
    ]);
  });

  it("up -> down -> up: колонки зникають і повертаються, 029-колонки цілі", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const columns = async (table: string) =>
      (
        await pool!.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = $1`,
          [table],
        )
      ).rows.map((r) => r.column_name);
    await pool!.query(down);
    const sets = await columns("fizruk_workout_sets");
    expect(sets).not.toContain("duration_sec");
    expect(sets).not.toContain("distance_m");
    const items = await columns("fizruk_workout_items");
    expect(items).not.toContain("measure");
    expect(items).toContain("duration_sec");
    expect(items).toContain("distance_m");
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    expect(await columns("fizruk_workout_sets")).toContain("duration_sec");
    expect(await columns("fizruk_workout_items")).toContain("measure");
  });
});
