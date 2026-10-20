// Міграція 160 - `user_avatars` (аудит 2026-10-01, ux-14).
//
// Два лейни, як у `158-finyk-tx-tags.test.ts`.
// 1. СТАТИЧНИЙ фіксує намір: additive, PK + FK на "user" з каскадом, bytea,
//    down прибирає рівно своє.
// 2. ЖИВИЙ ставить усі міграції з нуля на справжньому Postgres і проганяє
//    bytea-раундтрип, каскад і up -> down -> up. Soft-skip без Docker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "160_user_avatars.sql";
const DOWN_FILE = "160_user_avatars.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("160 - форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("створює таблицю ідемпотентно з PK user_id і FK на user(id) з каскадом", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS user_avatars/);
    expect(body).toMatch(
      /user_id\s+TEXT PRIMARY KEY REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
  });

  it("зберігає байти як BYTEA NOT NULL і тип контенту", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/data\s+BYTEA NOT NULL/);
    expect(body).toMatch(/content_type\s+TEXT NOT NULL/);
    expect(body).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });

  it("additive: без DROP і ALTER у forward-міграції (Hard Rule #4)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/\bALTER\b/);
  });

  it("down прибирає лише свою таблицю", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(/DROP TABLE IF EXISTS user_avatars;/);
    expect(body).not.toMatch(/ALTER/);
  });
});

describe("160 - живий Postgres", () => {
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
        `[160-user-avatars] Skipping live lane: Testcontainers unavailable - ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  it("bytea-раундтрип без втрат і upsert по user_id", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('av-u1', 'av-u1', 'av-u1@example.test', false, NOW(), NOW())`,
    );
    const bytes = Buffer.from([0x00, 0xff, 0x52, 0x49, 0x46, 0x46, 0x80, 0x00]);
    const upsert = `INSERT INTO user_avatars (user_id, content_type, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = NOW()`;
    await pool!.query(upsert, ["av-u1", "image/webp", bytes]);
    await pool!.query(upsert, ["av-u1", "image/png", bytes]);
    const r = await pool!.query(
      `SELECT content_type, data FROM user_avatars WHERE user_id = 'av-u1'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].content_type).toBe("image/png");
    expect(Buffer.compare(r.rows[0].data, bytes)).toBe(0);
  });

  it("видалення користувача каскадом прибирає його аватар", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await pool!.query(`DELETE FROM "user" WHERE id = 'av-u1'`);
    const r = await pool!.query(
      `SELECT 1 FROM user_avatars WHERE user_id = 'av-u1'`,
    );
    expect(r.rows).toHaveLength(0);
  });

  it("FK не пускає аватар неіснуючого користувача", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await expect(
      pool!.query(
        `INSERT INTO user_avatars (user_id, content_type, data) VALUES ('ghost', 'image/png', '\\x00')`,
      ),
    ).rejects.toThrow(/foreign key/i);
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
      `SELECT to_regclass('public.user_avatars') AS t`,
    );
    expect(gone.rows[0].t).toBeNull();
    await pool!.query(downSql);
    await pool!.query(upSql);
    await pool!.query(upSql);
    const back = await pool!.query(
      `SELECT to_regclass('public.user_avatars') AS t`,
    );
    expect(back.rows[0].t).not.toBeNull();
  });
});
