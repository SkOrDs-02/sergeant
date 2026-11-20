// Міграція 175 - тумблер push Фініка в `user_preferences`
// (спека finyk-limit-and-recurring-push, рішення власника 2026-11-19 Ф-4 (б)).
//
// Два лейни, як у `168-notification-quiet-hours.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: одна колонка BOOLEAN NOT NULL DEFAULT TRUE
//    (форма сусіднього `push_mono_transactions`), без DROP і індексу; down
//    прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres: дефолт на
//    наявному і новому рядку, up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "175_push_finyk_alerts.sql";
const DOWN_FILE = "175_push_finyk_alerts.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("175 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("додає тумблер, увімкнений за замовчуванням", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /ALTER TABLE user_preferences\s+ADD COLUMN IF NOT EXISTS push_finyk_alerts BOOLEAN NOT NULL DEFAULT TRUE;/,
    );
  });

  it("additive: без DROP, без індексу, без бекфілу", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/CREATE\s+INDEX/i);
    expect(body).not.toMatch(/\bUPDATE\b/);
  });

  it("COMMENT ON COLUMN на колонку", () => {
    expect(up).toMatch(
      /COMMENT ON COLUMN user_preferences\.push_finyk_alerts IS/,
    );
  });

  it("down прибирає лише push_finyk_alerts", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(
      /ALTER TABLE user_preferences DROP COLUMN IF EXISTS push_finyk_alerts;/,
    );
    expect(body.match(/DROP COLUMN/g)).toHaveLength(1);
    expect(body).not.toMatch(/push_mono_transactions|push_daily_cap/);
  });
});

describe("175 - живий Postgres", () => {
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
        `[175-push-finyk-alerts] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  const columns = async () =>
    (
      await pool!.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'user_preferences'`,
      )
    ).rows.map((r) => r.column_name);

  it("наявний рядок отримує TRUE, новий теж, NULL відкидається", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const q = (sql: string) => pool!.query(sql);
    await q(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('fa-u1', 'fa-u1', 'fa-u1@example.test', false, NOW(), NOW()),
              ('fa-u2', 'fa-u2', 'fa-u2@example.test', false, NOW(), NOW())`,
    );
    // Рядок, що існував до міграції.
    await q(down);
    await q(`INSERT INTO user_preferences (user_id) VALUES ('fa-u1')`);
    await q(up);
    await q(`INSERT INTO user_preferences (user_id) VALUES ('fa-u2')`);
    const r = await q(
      `SELECT user_id, push_finyk_alerts FROM user_preferences
        WHERE user_id IN ('fa-u1', 'fa-u2') ORDER BY user_id`,
    );
    expect(r.rows).toEqual([
      { user_id: "fa-u1", push_finyk_alerts: true },
      { user_id: "fa-u2", push_finyk_alerts: true },
    ]);
    await q(
      `UPDATE user_preferences SET push_finyk_alerts = FALSE WHERE user_id = 'fa-u2'`,
    );
    await expect(
      q(
        `UPDATE user_preferences SET push_finyk_alerts = NULL WHERE user_id = 'fa-u2'`,
      ),
    ).rejects.toThrow(/push_finyk_alerts/);
    // Повторний up не чіпає вибір людини.
    await q(up);
    const again = await q(
      `SELECT push_finyk_alerts FROM user_preferences WHERE user_id = 'fa-u2'`,
    );
    expect(again.rows[0]).toEqual({ push_finyk_alerts: false });
  });

  it("up -> down -> up: колонка зникає і повертається, сусіди на місці", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(down);
    const after = await columns();
    expect(after).not.toContain("push_finyk_alerts");
    expect(after).toContain("push_mono_transactions");
    expect(after).toContain("push_daily_cap");
    await pool!.query(down);
    await pool!.query(up);
    await pool!.query(up);
    expect(await columns()).toContain("push_finyk_alerts");
  });
});
