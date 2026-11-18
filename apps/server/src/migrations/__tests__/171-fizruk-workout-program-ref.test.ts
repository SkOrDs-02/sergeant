// Міграція 171 - привʼязка тренування до слоту програми у `fizruk_workouts`
// (спека fizruk-program-plan-sets, § Ризики, питання 1, варіант (А); П-10).
//
// Два лейни, як у `168-notification-quiet-hours.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: дві nullable колонки, без індексу і без DROP,
//    down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: наявне
//    тренування лишається без привʼязки, up -> down -> up. Soft-skip без
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
const UP_FILE = "171_fizruk_workout_program_ref.sql";
const DOWN_FILE = "171_fizruk_workout_program_ref.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("171 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("дві nullable колонки без дефолтів", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/ALTER TABLE fizruk_workouts/);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS program_id TEXT,/);
    expect(body).toMatch(
      /ADD COLUMN IF NOT EXISTS program_slot INTEGER\s+CONSTRAINT fizruk_workouts_program_slot_check CHECK \(program_slot >= 0\);/,
    );
    expect(body).not.toMatch(/NOT NULL|DEFAULT/);
  });

  it("additive: без DROP і без індексу (читаються разом із рядком)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/CREATE\s+INDEX/i);
  });

  it("COMMENT ON COLUMN на обидві колонки", () => {
    for (const col of ["program_id", "program_slot"]) {
      expect(up).toMatch(
        new RegExp(`COMMENT ON COLUMN fizruk_workouts\\.${col} IS`),
      );
    }
  });

  it("down прибирає обидві колонки, не чіпаючи kcal_burned", () => {
    const body = statementsOnly(down);
    for (const col of ["program_slot", "program_id"]) {
      expect(body).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}\\b`));
    }
    expect(body).not.toMatch(/kcal_burned/);
  });
});

describe("171 - живий Postgres", () => {
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
        `[171-fizruk-workout-program-ref] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("тренування без привʼязки лишається NULL, відʼємний слот відкидає CHECK", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('fp-u1', 'fp-u1', 'fp-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO fizruk_workouts (id, user_id, started_at)
       VALUES ('w1', 'fp-u1', NOW())`,
    );
    const r = await pool!.query(
      `SELECT program_id, program_slot FROM fizruk_workouts WHERE id = 'w1'`,
    );
    expect(r.rows[0]).toEqual({ program_id: null, program_slot: null });
    await pool!.query(
      `UPDATE fizruk_workouts SET program_id = 'ppl', program_slot = 3 WHERE id = 'w1'`,
    );
    await expect(
      pool!.query(
        `UPDATE fizruk_workouts SET program_slot = -1 WHERE id = 'w1'`,
      ),
    ).rejects.toThrow(/fizruk_workouts_program_slot_check/);
  });

  it("up -> down -> up: колонки зникають і повертаються", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const columns = async () =>
      (
        await pool!.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = 'fizruk_workouts'`,
        )
      ).rows.map((r) => r.column_name);
    await pool!.query(down);
    const after = await columns();
    expect(after).not.toContain("program_id");
    expect(after).not.toContain("program_slot");
    expect(after).toContain("kcal_burned");
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    expect(await columns()).toContain("program_slot");
  });
});
