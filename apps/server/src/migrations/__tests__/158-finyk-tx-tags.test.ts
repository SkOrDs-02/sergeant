// Міграція 158 - `finyk_tx_tags` (спека finyk-analytics-v3, Р6.3).
//
// Два лейни, як у `153-ai-photo-refine-grants.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: additive, FK на "user" з каскадом, PK
//    (user_id, transaction_id) під upsert застосувача, tombstone-колонка
//    `deleted_at`, down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres і проганяє
//    up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "158_finyk_tx_tags.sql";
const DOWN_FILE = "158_finyk_tx_tags.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("158 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("створює таблицю ідемпотентно з PK (user_id, transaction_id)", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS finyk_tx_tags/);
    expect(body).toMatch(/PRIMARY KEY \(user_id, transaction_id\)/);
  });

  it("має FK на user(id) з каскадом і tombstone-колонку deleted_at", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /user_id\s+TEXT\s+NOT NULL REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
    expect(body).toMatch(/deleted_at\s+TIMESTAMPTZ,/);
    expect(body).toMatch(/tags_json\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("additive: без DROP і ALTER у forward-міграції (Hard Rule #4)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/\bALTER\b/);
  });

  it("down прибирає індекс і таблицю, нічого чужого", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(/DROP INDEX IF EXISTS finyk_tx_tags_user_active_idx;/);
    expect(body).toMatch(/DROP TABLE IF EXISTS finyk_tx_tags;/);
    expect(body).not.toMatch(/ALTER/);
  });
});

describe("158 - живий Postgres", () => {
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
        `[158-finyk-tx-tags] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("видалення користувача каскадом прибирає його теги", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('tags-u1', 'tags-u1', 'tags-u1@example.test', false, NOW(), NOW())`,
    );
    await pool!.query(
      `INSERT INTO finyk_tx_tags (user_id, transaction_id, tags_json)
       VALUES ('tags-u1', 'tx-1', '["а","б"]'::jsonb)`,
    );
    await pool!.query(`DELETE FROM "user" WHERE id = 'tags-u1'`);
    const r = await pool!.query(
      `SELECT 1 FROM finyk_tx_tags WHERE user_id = 'tags-u1'`,
    );
    expect(r.rows).toHaveLength(0);
  });

  it("up -> down -> up: ідемпотентно", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const downSql = await fs.readFile(
      path.join(MIGRATIONS_DIR, DOWN_FILE),
      "utf8",
    );
    const upSql = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    await pool!.query(downSql);
    const gone = await pool!.query(
      `SELECT to_regclass('public.finyk_tx_tags') AS t`,
    );
    expect(gone.rows[0].t).toBeNull();
    await pool!.query(downSql);
    await pool!.query(upSql);
    await pool!.query(upSql);
    const back = await pool!.query(
      `SELECT to_regclass('public.finyk_tx_tags') AS t`,
    );
    expect(back.rows[0].t).not.toBeNull();
  });
});
