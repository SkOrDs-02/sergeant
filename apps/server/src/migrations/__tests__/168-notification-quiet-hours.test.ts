// Міграція 168 - тихі години, пояс пристрою і тумблер push Monobank у
// `user_preferences` (спека notifications-quiet-hours-and-device-time).
//
// Два лейни, як у `160-user-avatars.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: лише ADD з DEFAULT або nullable, три CHECK-и,
//    дефолти = поведінка до міграції, down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: дефолти на
//    наявному рядку, CHECK однакових меж, up -> down -> up. Soft-skip без
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
const UP_FILE = "168_notification_quiet_hours_and_time_zone.sql";
const DOWN_FILE = "168_notification_quiet_hours_and_time_zone.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("168 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("додає пʼять колонок з дефолтами = поведінка до міграції", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS time_zone TEXT,/);
    expect(body).toMatch(/quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
    // 22:00 і 08:00 - колишні QUIET_HOURS_START_KYIV / END_KYIV.
    expect(body).toMatch(
      /quiet_hours_start_min SMALLINT NOT NULL DEFAULT 1320/,
    );
    expect(body).toMatch(/quiet_hours_end_min SMALLINT NOT NULL DEFAULT 480/);
    expect(body).toMatch(
      /push_mono_transactions BOOLEAN NOT NULL DEFAULT TRUE/,
    );
  });

  it("три CHECK-и: довжина поясу, діапазон хвилин, різні межі", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /user_preferences_time_zone_len[\s\S]*char_length\(time_zone\) BETWEEN 1 AND 64/,
    );
    expect(body).toMatch(
      /user_preferences_quiet_hours_range[\s\S]*BETWEEN 0 AND 1439/,
    );
    expect(body).toMatch(
      /user_preferences_quiet_hours_distinct[\s\S]*quiet_hours_start_min <> quiet_hours_end_min/,
    );
  });

  it("additive: без DROP і без індексів (читання за PK)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/CREATE\s+INDEX/i);
  });

  it("COMMENT ON COLUMN на кожну колонку", () => {
    for (const col of [
      "time_zone",
      "quiet_hours_enabled",
      "quiet_hours_start_min",
      "quiet_hours_end_min",
      "push_mono_transactions",
    ]) {
      expect(up).toMatch(
        new RegExp(`COMMENT ON COLUMN user_preferences\\.${col} IS`),
      );
    }
  });

  it("down прибирає три обмеження і пʼять колонок, не чіпаючи push_daily_cap", () => {
    const body = statementsOnly(down);
    for (const c of [
      "user_preferences_quiet_hours_distinct",
      "user_preferences_quiet_hours_range",
      "user_preferences_time_zone_len",
    ]) {
      expect(body).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${c}`));
    }
    for (const col of [
      "push_mono_transactions",
      "quiet_hours_end_min",
      "quiet_hours_start_min",
      "quiet_hours_enabled",
      "time_zone",
    ]) {
      expect(body).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}\\b`));
    }
    expect(body).not.toMatch(/push_daily_cap/);
  });
});

describe("168 - живий Postgres", () => {
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
        `[168-notification-quiet-hours] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("рядок без явних значень отримує дефолти, однакові межі відкидає CHECK", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('qh-u1', 'qh-u1', 'qh-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO user_preferences (user_id) VALUES ('qh-u1')`,
    );
    const r = await pool!.query(
      `SELECT time_zone, quiet_hours_enabled, quiet_hours_start_min,
              quiet_hours_end_min, push_mono_transactions
         FROM user_preferences WHERE user_id = 'qh-u1'`,
    );
    expect(r.rows[0]).toEqual({
      time_zone: null,
      quiet_hours_enabled: true,
      quiet_hours_start_min: 1320,
      quiet_hours_end_min: 480,
      push_mono_transactions: true,
    });
    await expect(
      pool!.query(
        `UPDATE user_preferences
            SET quiet_hours_start_min = 480, quiet_hours_end_min = 480
          WHERE user_id = 'qh-u1'`,
      ),
    ).rejects.toThrow(/user_preferences_quiet_hours_distinct/);
    await expect(
      pool!.query(
        `UPDATE user_preferences SET quiet_hours_end_min = 1440
          WHERE user_id = 'qh-u1'`,
      ),
    ).rejects.toThrow(/user_preferences_quiet_hours_range/);
  });

  it("up -> down -> up: колонки зникають і повертаються, push_daily_cap на місці", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const columns = async () =>
      (
        await pool!.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = 'user_preferences'`,
        )
      ).rows.map((r) => r.column_name);
    await pool!.query(down);
    const after = await columns();
    expect(after).not.toContain("time_zone");
    expect(after).not.toContain("push_mono_transactions");
    expect(after).toContain("push_daily_cap");
    await pool!.query(down);
    await pool!.query(up);
    expect(await columns()).toContain("quiet_hours_start_min");
  });
});
