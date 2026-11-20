// Міграція 176 - явний прапорець «виконано» і тип підходу Фізрука
// (спека fizruk-set-done-flag-and-set-type, рішення власника 2026-11-19
// Фз-3 (в)).
//
// Два лейни, як у `172-fizruk-set-measure.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: дві nullable колонки (`set_type` з CHECK на
//    форму), без індексу, дефолту і DROP; бекфіл із журналу до ALTER;
//    down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: наявний
//    підхід лишається NULL, CHECK відкидає чужу форму, бекфіл із
//    `sync_op_log` (останній оп по ключу, 1/0 як boolean, невалідне ->
//    NULL, повтор no-op), up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "176_fizruk_set_done_and_type.sql";
const DOWN_FILE = "176_fizruk_set_done_and_type.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("176 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("підходи: done BOOLEAN і set_type TEXT з CHECK на форму", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /ALTER TABLE fizruk_workout_sets\s+ADD COLUMN IF NOT EXISTS done BOOLEAN,/,
    );
    expect(body).toMatch(
      /ADD COLUMN IF NOT EXISTS set_type TEXT\s+CONSTRAINT fizruk_workout_sets_set_type_check CHECK \(set_type ~ '\^\[a-z_\]\{1,16\}\$'\);/,
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
      body.match(/CREATE TEMP TABLE m176_\w+ ON COMMIT DROP AS/g),
    ).toHaveLength(1);
    expect(body).toMatch(/l\.status = 'applied'/);
    expect(body).toMatch(/l\.op IN \('insert', 'update'\)/);
    expect(body.match(/client_ts DESC, op_id DESC/g)).toHaveLength(2);
  });

  it("бекфіл: перелік типів хендлера і лише NULL-колонки (повтор no-op)", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/IN \('warmup', 'drop', 'failure'\)/);
    expect(body).toMatch(/COALESCE\(s\.done, b\.done\)/);
    expect(body).toMatch(/COALESCE\(s\.set_type, b\.set_type\)/);
    expect(body.indexOf("UPDATE fizruk_workout_sets")).toBeGreaterThan(
      body.lastIndexOf("ALTER TABLE"),
    );
  });

  it("COMMENT ON COLUMN на обидві колонки", () => {
    for (const col of ["done", "set_type"]) {
      expect(up).toMatch(
        new RegExp(`COMMENT ON COLUMN fizruk_workout_sets\\.${col} IS`),
      );
    }
  });

  it("down прибирає рівно дві колонки", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(
      /ALTER TABLE fizruk_workout_sets\s+DROP COLUMN IF EXISTS set_type,\s+DROP COLUMN IF EXISTS done;/,
    );
    expect(body.match(/DROP COLUMN/g)).toHaveLength(2);
  });
});

describe("176 - живий Postgres", () => {
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
        `[176-fizruk-set-done-and-type] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("наявний підхід лишається NULL, CHECK відкидає чужу форму", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('sd-u1', 'sd-u1', 'sd-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workouts (id, user_id, started_at)
       VALUES ('w1', 'sd-u1', NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workout_items (id, workout_id, user_id, exercise_id, name_uk)
       VALUES ('i1', 'w1', 'sd-u1', 'squat', 'Присід')`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workout_sets (id, workout_item_id, user_id)
       VALUES ('s1', 'i1', 'sd-u1')`,
    );
    const set = await pool!.query(
      `SELECT done, set_type FROM fizruk_workout_sets WHERE id = 's1'`,
    );
    expect(set.rows[0]).toEqual({ done: null, set_type: null });

    await pool!.query(
      `UPDATE fizruk_workout_sets SET done = FALSE, set_type = 'warmup' WHERE id = 's1'`,
    );
    await expect(
      pool!.query(
        `UPDATE fizruk_workout_sets SET set_type = 'WarmUp' WHERE id = 's1'`,
      ),
    ).rejects.toThrow(/fizruk_workout_sets_set_type_check/);
    await expect(
      pool!.query(
        `UPDATE fizruk_workout_sets SET set_type = 'a_very_long_set_type' WHERE id = 's1'`,
      ),
    ).rejects.toThrow(/fizruk_workout_sets_set_type_check/);
  });

  it("бекфіл із журналу: останній оп по ключу, невалідне пропускається, повтор no-op", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const q = (sql: string, params: unknown[] = []) => pool!.query(sql, params);
    // Стан «старий сервер»: колонок ще немає, рядки є, оп-и в журналі.
    await q(down);
    const sets = ["bs1", "bs2", "bs3", "bs4", "bs5", "bs6"];
    for (const id of sets) {
      await q(
        `INSERT INTO fizruk_workout_sets (id, workout_item_id, user_id)
         VALUES ($1, 'i1', 'sd-u1')`,
        [id],
      );
    }
    let n = 0;
    const op = (
      row: Record<string, unknown>,
      ts: string,
      status = "applied",
      kind = "update",
    ) =>
      q(
        `INSERT INTO sync_op_log
           (user_id, idempotency_key, table_name, op, row, client_ts, status)
         VALUES ('sd-u1', $1, 'fizruk_workout_sets', $2, $3, $4, $5)`,
        [`k${++n}`, kind, JSON.stringify(row), ts, status],
      );
    // bs1: останній оп за client_ts; старий оп без ключів не затирає.
    await op(
      { id: "bs1", done: false, set_type: "warmup" },
      "2026-11-19T10:00:00Z",
      "applied",
      "insert",
    );
    await op({ id: "bs1", done: true }, "2026-11-19T10:05:00Z");
    await op({ id: "bs1", reps: 8 }, "2026-11-19T10:06:00Z");
    // bs2: оп без ключів -> нічого.
    await op({ id: "bs2", reps: 5 }, "2026-11-19T10:00:00Z");
    // bs3: невалідні значення -> пропуск, міграція не падає.
    await op(
      { id: "bs3", done: "yes", set_type: "superset" },
      "2026-11-19T10:00:00Z",
    );
    // bs4: rejected-оп не рахується; 0/1 із SQLite читається як boolean.
    await op(
      { id: "bs4", done: 1, set_type: "failure" },
      "2026-11-19T11:00:00Z",
      "rejected",
    );
    await op({ id: "bs4", done: 0, set_type: "drop" }, "2026-11-19T10:00:00Z");
    // bs5: останній оп явно очищає ключ -> NULL.
    await op({ id: "bs5", set_type: "drop" }, "2026-11-19T10:00:00Z");
    await op({ id: "bs5", set_type: null }, "2026-11-19T10:01:00Z");
    // bs6: число 1 -> true.
    await op({ id: "bs6", done: 1 }, "2026-11-19T10:00:00Z");

    await q(up);
    const setRows = async () =>
      (
        await q(
          `SELECT id, done, set_type FROM fizruk_workout_sets
            WHERE id = ANY($1) ORDER BY id`,
          [sets],
        )
      ).rows;
    expect(await setRows()).toEqual([
      { id: "bs1", done: true, set_type: "warmup" },
      { id: "bs2", done: null, set_type: null },
      { id: "bs3", done: null, set_type: null },
      { id: "bs4", done: false, set_type: "drop" },
      { id: "bs5", done: null, set_type: null },
      { id: "bs6", done: true, set_type: null },
    ]);

    // Уже заповнену колонку бекфіл не чіпає; повторний прогін нічого не міняє.
    await q(`UPDATE fizruk_workout_sets SET done = FALSE WHERE id = 'bs1'`);
    const before = await setRows();
    await q(up);
    const after = await setRows();
    expect(after).toEqual(before);
    expect(after[0]).toEqual({ id: "bs1", done: false, set_type: "warmup" });
  });

  it("up -> down -> up: колонки зникають і повертаються, 172-колонки цілі", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const columns = async () =>
      (
        await pool!.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = 'fizruk_workout_sets'`,
        )
      ).rows.map((r) => r.column_name);
    await pool!.query(down);
    const sets = await columns();
    expect(sets).not.toContain("done");
    expect(sets).not.toContain("set_type");
    expect(sets).toContain("duration_sec");
    expect(sets).toContain("distance_m");
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    const back = await columns();
    expect(back).toContain("done");
    expect(back).toContain("set_type");
  });
});
