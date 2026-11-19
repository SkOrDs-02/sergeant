// Міграція 174 - бекфіл із журналу полів звичок (170) і привʼязки
// тренування до програми (171), які старий контейнер не записав у таблиці.
// Передумова чистки журналу (ADR-0105 §2).
//
// Два лейни, як у `172-fizruk-set-measure.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: лише DML без зміни схеми, лише applied
//    insert/update, останній оп по ключу, межі хендлера, лише NULL-колонки,
//    `updated_at` не чіпається; down нічого не робить.
// 2. ЖИВИЙ на справжньому Postgres: значення з журналу, ключ без значення не
//    затирає, явний null і невалідне пропускаються, наявне не
//    перезаписується, rejected-оп ігнорується, повтор no-op. Testcontainers
//    або змігрована одноразова база в `SYNC_IT_DATABASE_URL`; soft-skip без
//    Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "174_sync_retention_backfill_lagging_columns.sql";
const DOWN_FILE = "174_sync_retention_backfill_lagging_columns.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("174 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("лише DML: без ALTER, CREATE, DROP і без зміни updated_at", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\b(ALTER|CREATE|DROP|TRUNCATE)\b/i);
    expect(body).not.toMatch(/updated_at/);
    expect(body.match(/^UPDATE \w+/gm)).toEqual([
      "UPDATE routine_habits",
      "UPDATE fizruk_workouts",
    ]);
  });

  it("журнал: лише applied insert/update, останній оп по ключу", () => {
    const body = statementsOnly(up);
    expect(body.match(/l\.status = 'applied'/g)).toHaveLength(2);
    expect(body.match(/l\.op IN \('insert', 'update'\)/g)).toHaveLength(2);
    expect(body.match(/client_ts DESC, (op_id|l\.id) DESC/g)).toHaveLength(4);
  });

  it("межі хендлера і лише NULL-колонки", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/BETWEEN 1 AND 2147483647/);
    expect(body).toMatch(/char_length\(u\.v #>> '\{\}'\) <= 200/);
    expect(body).toMatch(
      /IN \('fizruk_workout', 'nutrition_water_goal',\s+'finyk_expense'\)/,
    );
    expect(body).toMatch(/BETWEEN 0 AND 2147483647/);
    expect(body).toMatch(/COALESCE\(h\.count_target, b\.count_target\)/);
    expect(body).toMatch(
      /AND w\.program_id IS NULL\s+AND w\.program_slot IS NULL/,
    );
  });

  it("down нічого не змінює", () => {
    expect(statementsOnly(down).trim()).toBe("SELECT 1;");
  });
});

describe("174 - живий Postgres", () => {
  let container: StartedTestContainer | null = null;
  let pool: pg.Pool | null = null;
  let dbAvailable = false;
  const userId = `bf174-${randomUUID()}`;

  beforeAll(async () => {
    try {
      let uri = process.env["SYNC_IT_DATABASE_URL"];
      const external = Boolean(uri);
      if (!uri) {
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
        uri = `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`;
      }
      pool = new pg.Pool({ connectionString: uri, max: 4 });
      if (!external) {
        const files = (await fs.readdir(MIGRATIONS_DIR))
          .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
          .sort();
        for (const f of files) {
          const sql = (
            await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf8")
          ).trim();
          if (sql) await pool.query(sql);
        }
      }
      dbAvailable = true;
    } catch (e) {
      console.warn(
        `[174-sync-retention-backfill] Skipping live lane: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (dbAvailable) {
      await pool!
        .query(`DELETE FROM "user" WHERE id = $1`, [userId])
        .catch(() => {});
    }
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("дотягує поля з журналу за правилами хендлера, повтор no-op", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const q = (sql: string, params: unknown[] = []) => pool!.query(sql, params);
    await q(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $1, $1 || '@example.test', false, NOW(), NOW())`,
      [userId],
    );
    for (const id of ["h1", "h2", "h3", "h4"]) {
      await q(
        `INSERT INTO routine_habits (id, user_id, name) VALUES ($1, $2, $1)`,
        [id, userId],
      );
    }
    await q(
      `UPDATE routine_habits SET count_target = 3 WHERE user_id = $1 AND id = 'h4'`,
      [userId],
    );
    for (const id of ["w1", "w2", "w3"]) {
      await q(
        `INSERT INTO fizruk_workouts (id, user_id, started_at) VALUES ($1, $2, NOW())`,
        [id, userId],
      );
    }
    const updatedBefore = await q(
      `SELECT id, updated_at FROM routine_habits WHERE user_id = $1 ORDER BY id`,
      [userId],
    );

    let n = 0;
    const op = (
      table: string,
      row: Record<string, unknown>,
      ts: string,
      status = "applied",
    ) =>
      q(
        `INSERT INTO sync_op_log
           (user_id, idempotency_key, table_name, op, row, client_ts, status)
         VALUES ($1, $2, $3, 'update', $4, $5, $6)`,
        [userId, `k174-${++n}`, table, JSON.stringify(row), ts, status],
      );
    const H = "routine_habits";
    // h1: значення з першого опа; пізніший оп без ключів їх не затирає,
    // rejected-оп із іншим значенням ігнорується.
    await op(
      H,
      {
        id: "h1",
        count_target: 8,
        count_unit: "склянки",
        auto_mark_source: "nutrition_water_goal",
      },
      "2026-11-18T10:00:00Z",
    );
    await op(H, { id: "h1", name: "h1-renamed" }, "2026-11-18T11:00:00Z");
    await op(
      H,
      { id: "h1", count_target: 99 },
      "2026-11-18T12:00:00Z",
      "rejected",
    );
    // h2: останній оп з ключем очистив значення — пишемо нічого.
    await op(H, { id: "h2", count_target: 5 }, "2026-11-18T10:00:00Z");
    await op(H, { id: "h2", count_target: null }, "2026-11-18T12:00:00Z");
    // h3: останній count_target невалідний (0), старіший рядок "7" не
    // рятує; невалідне джерело пропускається, валідна одиниця пишеться.
    await op(H, { id: "h3", count_target: "7" }, "2026-11-18T09:00:00Z");
    await op(
      H,
      { id: "h3", count_target: 0, count_unit: "x", auto_mark_source: "bogus" },
      "2026-11-18T10:00:00Z",
    );
    // h4: наявне значення не перезаписується.
    await op(H, { id: "h4", count_target: 9 }, "2026-11-18T10:00:00Z");
    const W = "fizruk_workouts";
    await op(
      W,
      { id: "w1", program_id: "p1", program_slot: 2 },
      "2026-11-18T10:00:00Z",
    );
    await op(
      W,
      { id: "w2", program_id: "p1", program_slot: -1 },
      "2026-11-18T10:00:00Z",
    );
    await op(
      W,
      { id: "w3", program_id: "p2", program_slot: 1 },
      "2026-11-18T10:00:00Z",
    );
    await op(
      W,
      { id: "w3", program_id: null, program_slot: null },
      "2026-11-18T11:00:00Z",
    );

    const run = async () => {
      const c = await pool!.connect();
      try {
        await c.query("BEGIN");
        await c.query(up);
        await c.query("COMMIT");
      } finally {
        c.release();
      }
    };
    await run();

    const habits = await q(
      `SELECT id, count_target, count_unit, auto_mark_source, updated_at
         FROM routine_habits WHERE user_id = $1 ORDER BY id`,
      [userId],
    );
    expect(habits.rows.map(({ updated_at: _u, ...rest }) => rest)).toEqual([
      {
        id: "h1",
        count_target: 8,
        count_unit: "склянки",
        auto_mark_source: "nutrition_water_goal",
      },
      {
        id: "h2",
        count_target: null,
        count_unit: null,
        auto_mark_source: null,
      },
      { id: "h3", count_target: null, count_unit: "x", auto_mark_source: null },
      { id: "h4", count_target: 3, count_unit: null, auto_mark_source: null },
    ]);
    expect(habits.rows.map((r) => r.updated_at)).toEqual(
      updatedBefore.rows.map((r) => r.updated_at),
    );
    const workouts = await q(
      `SELECT id, program_id, program_slot FROM fizruk_workouts
        WHERE user_id = $1 ORDER BY id`,
      [userId],
    );
    expect(workouts.rows).toEqual([
      { id: "w1", program_id: "p1", program_slot: 2 },
      { id: "w2", program_id: null, program_slot: null },
      { id: "w3", program_id: null, program_slot: null },
    ]);

    // Повтор нічого не змінює.
    const snapshot = JSON.stringify([habits.rows, workouts.rows]);
    await run();
    const again = await Promise.all([
      q(
        `SELECT id, count_target, count_unit, auto_mark_source, updated_at
           FROM routine_habits WHERE user_id = $1 ORDER BY id`,
        [userId],
      ),
      q(
        `SELECT id, program_id, program_slot FROM fizruk_workouts
          WHERE user_id = $1 ORDER BY id`,
        [userId],
      ),
    ]);
    expect(JSON.stringify([again[0].rows, again[1].rows])).toBe(snapshot);
  });
});
