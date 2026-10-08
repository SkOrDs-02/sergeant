// Міграція 153 — `ai_photo_refine_grants` (sec-14 аудиту 2026-10-01, ADR-0100).
//
// Два лейни, як у `087-nutrition-goal-periods.test.ts`.
// 1. СТАТИЧНИЙ читає SQL як текст і фіксує намір: additive, FK на "user" з
//    каскадом (гранти = SHA-256 фото користувача, мусять зникнути разом з
//    акаунтом), PK (user_id, image_sha256) для upsert-а з `photoRefineGrant.ts`,
//    індекс за `created_at` для глобального підчищення, down прибирає рівно своє.
// 2. ЖИВИЙ піднімає Postgres, ставить усі міграції з нуля й доводить на справжній
//    схемі: SQL з `photoRefineGrant.ts` (upsert, пошук, підчищення) працює, а
//    видалення користувача каскадом прибирає гранти. Soft-skip без Docker.
//
// Чому цей файл існує: без самої таблиці код `photoRefineGrant.ts` мовчки
// деградує (збій запису/пошуку = «гранту немає»), refine того самого знімка
// списує квоту, а юніт-тести лишаються зеленими, бо `db.js` у них підмінено.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP_FILE = "153_ai_photo_refine_grants.sql";
const DOWN_FILE = "153_ai_photo_refine_grants.down.sql";
const TIMEOUT_MS = 180_000;

let up = "";
let down = "";

/** SQL без коментарів: преамбули самі називають `DROP`/`ALTER` словами. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("153 — форма (статичний лейн)", () => {
  beforeAll(async () => {
    up = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    down = await fs.readFile(path.join(MIGRATIONS_DIR, DOWN_FILE), "utf8");
  });

  it("створює таблицю ідемпотентно з PK (user_id, image_sha256)", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS ai_photo_refine_grants/);
    expect(body).toMatch(/PRIMARY KEY \(user_id, image_sha256\)/);
  });

  it("тримає FK на user(id) з каскадом: хеші фото не переживають акаунт", () => {
    expect(statementsOnly(up)).toMatch(
      /user_id\s+TEXT\s+NOT NULL REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
  });

  it("має індекс за created_at для глобального підчищення", () => {
    expect(statementsOnly(up)).toMatch(
      /CREATE INDEX IF NOT EXISTS ai_photo_refine_grants_created_at_idx\s*\n\s*ON ai_photo_refine_grants \(created_at\)/,
    );
  });

  it("additive: без DROP і ALTER у forward-міграції (Hard Rule #4)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).not.toMatch(/\bALTER\b/);
  });

  it("down прибирає індекс і таблицю, нічого чужого", () => {
    const body = statementsOnly(down);
    expect(body).toMatch(
      /DROP INDEX IF EXISTS ai_photo_refine_grants_created_at_idx;/,
    );
    expect(body).toMatch(/DROP TABLE IF EXISTS ai_photo_refine_grants;/);
    expect(body).not.toMatch(/ALTER/);
  });
});

describe("153 — живий Postgres", () => {
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
        `[153-ai-photo-refine-grants] Skipping live lane: Testcontainers unavailable — ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, TIMEOUT_MS);

  async function seedUser(id: string): Promise<void> {
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $1, $1 || '@example.test', false, NOW(), NOW())`,
      [id],
    );
  }

  it("upsert, пошук і підчищення з photoRefineGrant.ts працюють на справжній схемі", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedUser("grant-u1");
    const now = Date.now();
    const upsert = `INSERT INTO ai_photo_refine_grants (user_id, image_sha256, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, image_sha256)
         DO UPDATE SET created_at = EXCLUDED.created_at`;
    await pool!.query(upsert, ["grant-u1", "sha-a", new Date(now)]);
    // Повторний analyze того ж кадру оновлює рядок, а не дублює.
    await pool!.query(upsert, ["grant-u1", "sha-a", new Date(now + 1000)]);
    await pool!.query(upsert, [
      "grant-u1",
      "sha-old",
      new Date(now - 25 * 3600_000),
    ]);

    const fresh = await pool!.query(
      `SELECT 1 FROM ai_photo_refine_grants
        WHERE user_id = $1 AND image_sha256 = $2 AND created_at > $3`,
      ["grant-u1", "sha-a", new Date(now - 24 * 3600_000)],
    );
    expect(fresh.rows).toHaveLength(1);
    const stale = await pool!.query(
      `SELECT 1 FROM ai_photo_refine_grants
        WHERE user_id = $1 AND image_sha256 = $2 AND created_at > $3`,
      ["grant-u1", "sha-old", new Date(now - 24 * 3600_000)],
    );
    expect(stale.rows).toHaveLength(0);

    await pool!.query(
      `DELETE FROM ai_photo_refine_grants
        WHERE ctid IN (
          SELECT ctid FROM ai_photo_refine_grants
           WHERE created_at < $1 LIMIT $2
        )`,
      [new Date(now - 24 * 3600_000), 1000],
    );
    const left = await pool!.query(
      `SELECT image_sha256 FROM ai_photo_refine_grants WHERE user_id = $1`,
      ["grant-u1"],
    );
    expect(left.rows.map((r) => r.image_sha256)).toEqual(["sha-a"]);
  });

  it("видалення користувача каскадом прибирає його гранти", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedUser("grant-u2");
    await pool!.query(
      `INSERT INTO ai_photo_refine_grants (user_id, image_sha256) VALUES ($1, $2)`,
      ["grant-u2", "sha-x"],
    );
    await pool!.query(`DELETE FROM "user" WHERE id = $1`, ["grant-u2"]);
    const r = await pool!.query(
      `SELECT 1 FROM ai_photo_refine_grants WHERE user_id = $1`,
      ["grant-u2"],
    );
    expect(r.rows).toHaveLength(0);
  });

  it("гранту без існуючого користувача не буває (FK)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await expect(
      pool!.query(
        `INSERT INTO ai_photo_refine_grants (user_id, image_sha256) VALUES ($1, $2)`,
        ["no-such-user", "sha-y"],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("down.sql відкочує, up.sql повертає: ідемпотентно", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const downSql = await fs.readFile(
      path.join(MIGRATIONS_DIR, DOWN_FILE),
      "utf8",
    );
    const upSql = await fs.readFile(path.join(MIGRATIONS_DIR, UP_FILE), "utf8");
    await pool!.query(downSql);
    const gone = await pool!.query(
      `SELECT to_regclass('public.ai_photo_refine_grants') AS t`,
    );
    expect(gone.rows[0].t).toBeNull();
    await pool!.query(upSql);
    await pool!.query(upSql);
    const back = await pool!.query(
      `SELECT to_regclass('public.ai_photo_refine_grants') AS t`,
    );
    expect(back.rows[0].t).not.toBeNull();
  });
});
