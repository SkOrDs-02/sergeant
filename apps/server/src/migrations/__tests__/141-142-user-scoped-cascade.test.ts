// Міграції 141 і 142 — цілісність видалення акаунта, і гейт проти
// повторення обох дефектів.
//
// Два лейни, як у `087-nutrition-goal-periods.test.ts`.
// ----------------------------------------------------
// 1. СТАТИЧНИЙ лейн читає SQL як текст і фіксує НАМІР: 141 спершу
//    чистить сиріт і лише потім вішає FK (зворотний порядок упав би з
//    23503 і заклинив деплой), 142 не використовує CONCURRENTLY
//    (раннер виконує файл у транзакції, де це заборонено).
// 2. ЖИВИЙ лейн піднімає Postgres і ставить УСІ міграції з нуля, після
//    чого перевіряє два інваріанти на справжній схемі. Він єдиний, хто
//    доводить, що каскад справді доїжджає.
//
// ГОЛОВНЕ ТУТ — не перевірка самих міграцій, а третій тест живого лейну:
// «кожна таблиця з `user_id` або має FK на `"user"`, або стоїть в
// ALLOWLIST». Саме його відсутність дозволила трьом таблицям
// (`fizruk_injuries`, `fizruk_custom_activities`, `ai_memory_ingest_failed`)
// мовчки переживати видалення акаунта: `deleteUserData` покладається на
// каскад (ADR-0016 §4), а нова таблиця без FK у цю модель не потрапляє й
// ніде не світиться. Додаєш таблицю з `user_id` — або дай їй FK, або
// внеси в ALLOWLIST із поясненням. Третього не дано.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const TIMEOUT_MS = 180_000;

/**
 * Таблиці, що НАВМИСНО тримають `user_id` без FK на `"user"`.
 *
 * Кожен запис — рішення, не забудькуватість. Розширювати цей список
 * можна лише разом із причиною: рядок тут означає «ці персональні дані
 * переживають видалення акаунта, і ми цього хочемо».
 */
const NO_FK_ALLOWLIST = new Map<string, string>([
  [
    "gdpr_cleanup_queue",
    "існує саме щоб пережити видалення: тримає роботу з прибирання у ЗОВНІШНІХ сервісах уже після того, як рядок користувача зник",
  ],
  [
    "email_unsubscribes",
    "opt-out мусить пережити акаунт, інакше видалення + повторна реєстрація тихо знімають відмову від розсилки",
  ],
  [
    "feedback_entries",
    "user_id nullable (фідбек буває анонімний); збереження тексту після видалення акаунта — продуктове рішення",
  ],
]);

let container: StartedTestContainer | null = null;
let pool: pg.Pool | null = null;
let dockerAvailable = false;
let skipReason: string | null = null;

/**
 * SQL без коментарів. Обовʼязково перед будь-яким матчингом: преамбули цих
 * міграцій самі описують `ADD CONSTRAINT`, `DELETE` і `CONCURRENTLY`
 * словами, тож регексп по сирому тексту читав би пояснення як код.
 */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Порядок застосування — той самий, що у `db.ts::listShippedMigrations`. */
async function applyAllMigrations(p: pg.Pool): Promise<void> {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of files) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await p.query(sql);
  }
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

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    pool = new pg.Pool({
      connectionString: `postgresql://hub:hub@${host}:${port}/hub_test`,
      max: 4,
    });
    await applyAllMigrations(pool);
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[141-142-user-scoped-cascade] Skipping: Testcontainers unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (pool) {
    await pool.end().catch(() => {
      /* noop */
    });
  }
  if (container) {
    await container.stop().catch(() => {
      /* noop */
    });
  }
});

describe("141/142 — статичний лейн (намір міграцій)", () => {
  it("141 чистить сиріт ДО того, як вішає FK", async () => {
    const sql = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "141_orphan_user_rows_fk.sql"),
        "utf8",
      ),
    );
    const firstDelete = sql.search(/^\s*DELETE FROM/m);
    const firstFk = sql.search(/ADD CONSTRAINT[\s\S]*?FOREIGN KEY/);
    expect(firstDelete).toBeGreaterThan(-1);
    expect(firstFk).toBeGreaterThan(-1);
    // Зворотний порядок — це 23503 на першому ж осиротілому рядку, і
    // деплой, який не лікується ретраєм.
    expect(firstDelete).toBeLessThan(firstFk);
  });

  it("141 вішає FK через NOT VALID + VALIDATE, а не прямим ADD CONSTRAINT", async () => {
    const sql = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "141_orphan_user_rows_fk.sql"),
        "utf8",
      ),
    );
    const notValid = sql.match(/NOT VALID/g) ?? [];
    const validate = sql.match(/VALIDATE CONSTRAINT/g) ?? [];
    expect(notValid.length).toBe(3);
    expect(validate.length).toBe(3);
  });

  it("142 не використовує CONCURRENTLY — раннер виконує файл у транзакції", async () => {
    const statements = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "142_cascade_user_id_indexes.sql"),
        "utf8",
      ),
    );
    expect(statements).not.toMatch(/CONCURRENTLY/i);
  });
});

describe("141/142 — живий лейн (справжня схема)", () => {
  it(
    "видалення акаунта не лишає рядків у трьох закритих таблицях",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ('u_cascade', 'C', 'c@example.com', false, NOW(), NOW())`,
      );
      await pool.query(
        `INSERT INTO fizruk_injuries (id, user_id, site, started_at, note)
         VALUES ('inj_c', 'u_cascade', 'knee', NOW(), 'нотатка про травму')`,
      );
      await pool.query(
        `INSERT INTO fizruk_custom_activities (id, user_id, data_json)
         VALUES ('act_c', 'u_cascade', '{"name":"йога"}')`,
      );
      await pool.query(
        `INSERT INTO ai_memory_ingest_failed (user_id, source, payload_json, error_msg, attempts)
         VALUES ('u_cascade', 'chat', '{"text":"факт"}', 'boom', 1)`,
      );

      await pool.query(`DELETE FROM "user" WHERE id = 'u_cascade'`);

      for (const table of [
        "fizruk_injuries",
        "fizruk_custom_activities",
        "ai_memory_ingest_failed",
      ]) {
        const { rows } = await pool.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${table} WHERE user_id = 'u_cascade'`,
        );
        expect(
          Number(rows[0]!.n),
          `${table} лишила рядки після видалення акаунта`,
        ).toBe(0);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'кожна user-scoped таблиця має FK на "user" або стоїть в ALLOWLIST',
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      const { rows } = await pool.query<{ tbl: string }>(`
        SELECT c.relname AS tbl
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'user_id'
                             AND a.attnum > 0 AND NOT a.attisdropped
         WHERE c.relkind = 'r'
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint con
               JOIN LATERAL unnest(con.conkey) k(attnum) ON true
              WHERE con.contype = 'f'
                AND con.conrelid = c.oid
                AND k.attnum = a.attnum
           )
         ORDER BY 1
      `);

      const unexplained = rows
        .map((r) => r.tbl)
        .filter((t) => !NO_FK_ALLOWLIST.has(t));

      expect(
        unexplained,
        `Таблиці з user_id без FK на "user" і без запису в ALLOWLIST: ${unexplained.join(", ")}.\n` +
          "deleteUserData покладається на каскад (ADR-0016 §4), тож такі дані переживуть видалення акаунта.\n" +
          'Дай таблиці FK ... REFERENCES "user"(id) ON DELETE CASCADE — або внеси її в NO_FK_ALLOWLIST із причиною.',
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "каскадний DELETE бере індекс, а не Seq Scan",
    async (ctx) => {
      if (!dockerAvailable || !pool) {
        ctx.skip();
        return;
      }
      // `enable_seqscan = off` тут не «підказка планувальнику», а сам
      // тест: частковий індекс `(user_id, deleted_at) WHERE deleted_at IS
      // NULL` для беззастережного DELETE НЕ придатний, тож до 142 план
      // лишався Seq Scan навіть із вимкненим seqscan.
      await pool.query("SET enable_seqscan = off");
      try {
        const { rows } = await pool.query<{ "QUERY PLAN": string }>(
          `EXPLAIN (COSTS OFF) DELETE FROM finyk_assets WHERE user_id = 'u_probe'`,
        );
        const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
        expect(plan, plan).not.toMatch(/Seq Scan/);
      } finally {
        await pool.query("SET enable_seqscan = on");
      }
    },
    TIMEOUT_MS,
  );
});
