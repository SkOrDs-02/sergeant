// Migration 163 — обрізання збережених задовгих `user.name` (sec-16).
//
// Статичний лейн стереже НАМІР: межа в SQL збігається з
// `MAX_USER_NAME_LENGTH`, UPDATE чіпає лише `"user".name` і лише задовгі
// рядки. Живий лейн проганяє міграцію на справжньому Postgres (без Docker —
// скіп, як у 143). Up → down → up покриває `rollback-sanity.test.ts`.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_USER_NAME_LENGTH } from "../../auth/sanitizeUserName.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP = path.join(MIGRATIONS_DIR, "163_user_name_truncate_overlong.sql");
const DOWN = path.join(
  MIGRATIONS_DIR,
  "163_user_name_truncate_overlong.down.sql",
);
const TIMEOUT_MS = 180_000;

let container: StartedTestContainer | null = null;
let pool: pg.Pool | null = null;
let dockerAvailable = false;

/** SQL без коментарів — преамбула сама згадує UPDATE і числа словами. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

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
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();
    pool = new pg.Pool({
      connectionString: `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`,
      max: 2,
    });
    dockerAvailable = true;
  } catch (e) {
    console.warn(
      `[163-user-name-truncate-overlong] Skipping live lane: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  await pool?.end().catch(() => {
    /* noop */
  });
  await container?.stop().catch(() => {
    /* noop */
  });
}, TIMEOUT_MS);

describe("163 — статичний лейн (намір міграції)", () => {
  it("межа в SQL дорівнює MAX_USER_NAME_LENGTH з auth-хука", async () => {
    // Розійдуться — і міграція або лишить імена, які хук уже вважає
    // задовгими, або обріже ті, що хук пропускає.
    const body = statementsOnly(await fs.readFile(UP, "utf8"));
    expect(body).toMatch(
      new RegExp(`left\\(name,\\s*${MAX_USER_NAME_LENGTH}\\)`, "i"),
    );
    expect(body).toMatch(
      new RegExp(`char_length\\(name\\)\\s*>\\s*${MAX_USER_NAME_LENGTH}`, "i"),
    );
  });

  it('чіпає лише "user" і лише name/updatedAt', async () => {
    const body = statementsOnly(await fs.readFile(UP, "utf8"));
    const tables = [...body.matchAll(/UPDATE\s+("?\w+"?)/gi)].map((m) => m[1]);
    expect(tables).toEqual(['"user"']);
    expect(body).not.toMatch(/\bemail\b|\bimage\b/i);
  });

  it("не є DDL, а down — no-op", async () => {
    const up = statementsOnly(await fs.readFile(UP, "utf8"));
    expect(up).not.toMatch(/\b(ALTER|DROP|CREATE)\b/i);
    const down = statementsOnly(await fs.readFile(DOWN, "utf8")).trim();
    expect(down).toBe("SELECT 1;");
  });
});

describe("163 — живий лейн (справжній Postgres)", () => {
  async function seed(names: Record<string, string>): Promise<void> {
    await pool!.query(`
      DROP TABLE IF EXISTS "user";
      CREATE TABLE "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT '2026-01-01T00:00:00Z'
      );
    `);
    for (const [id, name] of Object.entries(names)) {
      await pool!.query(
        `INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`,
        [id, name, `${id}@example.com`],
      );
    }
  }

  async function rows(): Promise<
    Record<string, { len: number; touched: boolean }>
  > {
    const { rows: r } = await pool!.query<{
      id: string;
      len: number;
      touched: boolean;
    }>(
      `SELECT id, char_length(name) AS len,
              "updatedAt" > '2026-01-01T00:00:00Z' AS touched
         FROM "user" ORDER BY id`,
    );
    return Object.fromEntries(
      r.map((x) => [x.id, { len: x.len, touched: x.touched }]),
    );
  }

  it(
    "задовге обрізається до межі, решта не чіпається; повтор — no-op",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      await seed({
        long: "N".repeat(20_480),
        cyr: "Я".repeat(12_000),
        edge: "A".repeat(MAX_USER_NAME_LENGTH),
        short: "Олена",
      });
      const up = await fs.readFile(UP, "utf8");
      await pool.query(up);
      expect(await rows()).toEqual({
        cyr: { len: MAX_USER_NAME_LENGTH, touched: true },
        edge: { len: MAX_USER_NAME_LENGTH, touched: false },
        long: { len: MAX_USER_NAME_LENGTH, touched: true },
        short: { len: 5, touched: false },
      });
      const second = await pool.query(up);
      expect(second.rowCount).toBe(0);
    },
    TIMEOUT_MS,
  );
});
