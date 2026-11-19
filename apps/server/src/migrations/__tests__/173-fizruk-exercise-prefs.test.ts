// Міграція 173 - памʼять людини про тип виміру вправи,
// `fizruk_exercise_prefs` (спека fizruk-exercise-measure-type, міграція Б).
//
// Два лейни, як у `170-routine-habit-counter-and-auto-mark.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: нова таблиця з PK `(user_id, id)`, каскадом
//    від "user", CHECK на форму `measure`, без індексу і без DROP; down
//    прибирає лише її.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: вставка,
//    CHECK, каскад при видаленні людини, up -> down -> up. Soft-skip без
//    Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "173_fizruk_exercise_prefs.sql";
const DOWN_FILE = "173_fizruk_exercise_prefs.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("173 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("таблиця за зразком routine_habit_counts: PK (user_id, id), LWW, soft-delete", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS fizruk_exercise_prefs \(/);
    expect(body).toMatch(/\bid\s+TEXT NOT NULL,/);
    expect(body).toMatch(
      /user_id\s+TEXT NOT NULL REFERENCES "user"\(id\) ON DELETE CASCADE,/,
    );
    expect(body).toMatch(
      /measure\s+TEXT NOT NULL\s+CONSTRAINT fizruk_exercise_prefs_measure_check CHECK \(measure ~ '\^\[a-z_\]\{1,32\}\$'\),/,
    );
    expect(body).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\),/);
    expect(body).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\),/);
    expect(body).toMatch(/deleted_at\s+TIMESTAMPTZ,/);
    expect(body).toMatch(/PRIMARY KEY \(user_id, id\)/);
  });

  it("additive: без DROP, ALTER і окремого індексу (PK покриває)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/\bALTER\b/);
    expect(body).not.toMatch(/CREATE\s+INDEX/i);
  });

  it("COMMENT ON TABLE", () => {
    expect(up).toMatch(/COMMENT ON TABLE fizruk_exercise_prefs IS/);
  });

  it("down прибирає лише нову таблицю", () => {
    const body = statementsOnly(down).trim();
    expect(body).toBe("DROP TABLE IF EXISTS fizruk_exercise_prefs;");
  });
});

describe("173 - живий Postgres", () => {
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
        `[173-fizruk-exercise-prefs] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("рядок на вправу, CHECK на форму, каскад при видаленні людини", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('ep-u1', 'ep-u1', 'ep-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_exercise_prefs (id, user_id, measure)
       VALUES ('plank', 'ep-u1', 'time')`,
    );
    const r = await pool!.query(
      `SELECT measure, deleted_at FROM fizruk_exercise_prefs
        WHERE user_id = 'ep-u1' AND id = 'plank'`,
    );
    expect(r.rows[0]).toEqual({ measure: "time", deleted_at: null });
    await expect(
      pool!.query(
        `INSERT INTO fizruk_exercise_prefs (id, user_id, measure)
         VALUES ('plank', 'ep-u1', 'reps')`,
      ),
    ).rejects.toThrow(/fizruk_exercise_prefs_pkey/);
    await expect(
      pool!.query(
        `INSERT INTO fizruk_exercise_prefs (id, user_id, measure)
         VALUES ('squat', 'ep-u1', 'Weight Reps')`,
      ),
    ).rejects.toThrow(/fizruk_exercise_prefs_measure_check/);
    await pool!.query(`DELETE FROM "user" WHERE id = 'ep-u1'`);
    const left = await pool!.query(
      `SELECT count(*)::int AS n FROM fizruk_exercise_prefs WHERE user_id = 'ep-u1'`,
    );
    expect(left.rows[0]).toEqual({ n: 0 });
  });

  it("up -> down -> up: таблиця зникає і повертається", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const exists = async () =>
      (
        await pool!.query<{ t: string | null }>(
          `SELECT to_regclass('public.fizruk_exercise_prefs')::text AS t`,
        )
      ).rows[0]!.t;
    await pool!.query(down);
    expect(await exists()).toBeNull();
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    expect(await exists()).toBe("fizruk_exercise_prefs");
  });
});
