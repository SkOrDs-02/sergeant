/**
 * Спільний pgvector-контейнер для RAG-евалу.
 *
 * Витягнуто з `vectorStore.integration.test.ts` — обидва сьюти піднімають
 * той самий `pgvector/pgvector:pg17` і прокочують ті самі міграції.
 * Shared `test/pg-container.ts` тут не годиться: він на чистому
 * `postgres:17-alpine`, де `CREATE EXTENSION vector` у міграції 025 падає.
 *
 * AI-DANGER: `if (process.env["CI"]) throw e;` — не стилістика. Без цього
 * рядка раннер без Docker мовчки пропустив би сьют, і гейт світився б
 * зеленим, нічого не перевіривши. Локально пропуск припустимий, у CI —
 * ні.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   Читається лише каталог міграцій репозиторію, шлях складено з констант. */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

export interface PgVectorHandle {
  container?: StartedTestContainer;
  pool?: pg.Pool;
  /** Причина, з якої контейнер не піднявся. Поза CI це підстава пропустити сьют. */
  skipReason: string | null;
}

async function runMigrations(pool: pg.Pool): Promise<void> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await pool.query(sql);
  }
}

export async function startPgVector(label: string): Promise<PgVectorHandle> {
  try {
    const container = await new GenericContainer("pgvector/pgvector:pg17")
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

    const pool = new pg.Pool({
      connectionString: `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`,
      max: 4,
    });
    await runMigrations(pool);
    return { container, pool, skipReason: null };
  } catch (e) {
    if (process.env["CI"]) throw e;
    const skipReason = e instanceof Error ? e.message : String(e);
    console.warn(`[${label}] Skipping: pgvector unavailable — ${skipReason}`);
    return { skipReason };
  }
}

export async function stopPgVector(handle: PgVectorHandle): Promise<void> {
  if (handle.pool) await handle.pool.end().catch(() => {});
  if (handle.container) await handle.container.stop().catch(() => {});
}

/** `ai_memories.user_id` — FK CASCADE на `"user"`, тож юзер має існувати. */
export async function ensureUser(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@test.local`, userId],
  );
}
