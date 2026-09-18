// Гейт на міграцію 143 — прибирання легасі-імен із леджера `schema_migrations`.
//
// Чому це варте тесту, хоча міграція не чіпає схему. Вона редагує САМ реєстр
// застосованих міграцій, тобто структуру, на яку спирається раннер: помилка тут
// не дає 500-ки й не ламає запит — вона тихо змушує раннер виконати вже
// застосований DDL удруге (якщо загубити запис) або назавжди лишає постійний
// `unknown` у `schemaDrift.ts` (якщо не дочистити). Обидва наслідки видно лише
// на наступному деплої, тож ловити їх треба тут.
//
// Статичний лейн тримає НАМІР (guard на місці, беззастережного DELETE немає) і
// біжить усюди. Живий лейн перевіряє ФАКТ на справжньому Postgres і скіпається
// без Docker.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const MIGRATION = "143_schema_migrations_legacy_names.sql";
const TIMEOUT_MS = 180_000;

/** Легасі-ім'я → теперішнє ім'я того самого DDL. */
const RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["047_tg_topic_archive.sql", "048_tg_topic_archive.sql"],
  ["096_fizruk_injuries.sql", "097_fizruk_injuries.sql"],
  ["097_finyk_fizruk_pk_text.sql", "096_finyk_fizruk_pk_text.sql"],
];

let container: StartedTestContainer | null = null;
let pool: pg.Pool | null = null;
let dockerAvailable = false;

/**
 * SQL без коментарів. Обов'язково перед будь-яким матчингом: преамбула цієї
 * міграції сама описує `DELETE` і `UPDATE` словами, тож регексп по сирому
 * тексту читав би пояснення як код.
 */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

async function readMigration(): Promise<string> {
  return fs.readFile(path.join(MIGRATIONS_DIR, MIGRATION), "utf8");
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
      max: 4,
    });
    dockerAvailable = true;
  } catch (e) {
    console.warn(
      `[143-schema-migrations-legacy-names] Skipping live lane: ${
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

describe("143 — статичний лейн (намір міграції)", () => {
  it("DELETE стоїть під guard-ом EXISTS, а не беззастережний", async () => {
    const sql = statementsOnly(await readMigration());
    const deletes = sql.match(/DELETE\s+FROM\s+schema_migrations/gi) ?? [];
    expect(deletes.length, "очікується рівно один DELETE").toBe(1);
    // Саме цей guard відрізняє «прибрати дублікат» від «загубити факт
    // застосування»: без нього видалення одинака змусило б раннер виконати
    // той самий DDL удруге.
    expect(sql).toMatch(/DELETE[\s\S]*?AND\s+EXISTS\s*\(/i);
  });

  it("одинака переносить UPDATE-ом, а не лишає як є", async () => {
    const sql = statementsOnly(await readMigration());
    expect(sql).toMatch(/UPDATE\s+schema_migrations/i);
    // `applied_at` не переприсвоюється — час застосування має лишитись справжнім.
    expect(sql).not.toMatch(/SET[\s\S]{0,200}applied_at\s*=/i);
  });

  it("усе тіло стоїть під guard-ом на наявність леджера", async () => {
    // `schema_migrations` створює РАННЕР (`db.ts::ensureSchema`), не міграції.
    // Тестові гарнеси (`test/createIntegrationApp.ts`) прогонять `.sql` напряму
    // по свіжій базі й леджера не заводять — без guard-а ця міграція валить
    // кожен із них із 42P01. Спіймано CI на PR #101.
    const sql = statementsOnly(await readMigration());
    expect(sql).toMatch(
      /to_regclass\('public\.schema_migrations'\)\s+IS\s+NULL/i,
    );
    // Guard мусить стояти ПЕРЕД DML, інакше він нічого не боронить.
    expect(sql.indexOf("to_regclass")).toBeLessThan(
      sql.search(/DELETE\s+FROM\s+schema_migrations/i),
    );
  });

  it("покриває рівно ті три легасі-імені, що бачив прод", async () => {
    const sql = statementsOnly(await readMigration());
    for (const [legacy, current] of RENAMES) {
      expect(sql, `немає легасі-імені ${legacy}`).toContain(legacy);
      expect(sql, `немає теперішнього імені ${current}`).toContain(current);
    }
  });

  it("кожне теперішнє ім'я справді існує серед файлів міграцій", async () => {
    // Інакше міграція перейменувала б запис на ім'я, якого образ не шипить, —
    // і `unknown` не зник би, а просто змінив значення.
    const files = new Set(await fs.readdir(MIGRATIONS_DIR));
    for (const [, current] of RENAMES) {
      expect(files.has(current), `${current} немає в каталозі міграцій`).toBe(
        true,
      );
    }
  });
});

describe("143 — живий лейн (справжній Postgres)", () => {
  async function seed(rows: ReadonlyArray<readonly [string, string]>) {
    await pool!.query(`
      DROP TABLE IF EXISTS schema_migrations;
      CREATE TABLE schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum TEXT
      );
    `);
    for (const [name, appliedAt] of rows) {
      await pool!.query(
        "INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)",
        [name, appliedAt],
      );
    }
  }

  async function runMigration() {
    await pool!.query(await readMigration());
  }

  async function ledger(): Promise<Record<string, string>> {
    const { rows } = await pool!.query<{ name: string; day: string }>(
      "SELECT name, applied_at::date::text AS day FROM schema_migrations ORDER BY name",
    );
    return Object.fromEntries(rows.map((r) => [r.name, r.day]));
  }

  it(
    "дублікат: легасі-рядок прибирається, теперішній зберігає applied_at",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      await seed([
        ["047_tg_topic_archive.sql", "2026-07-01"],
        ["048_tg_topic_archive.sql", "2026-07-02"],
        ["096_fizruk_injuries.sql", "2026-08-01"],
        ["097_fizruk_injuries.sql", "2026-08-02"],
        ["097_finyk_fizruk_pk_text.sql", "2026-08-03"],
        ["096_finyk_fizruk_pk_text.sql", "2026-08-04"],
      ]);
      await runMigration();
      expect(await ledger()).toEqual({
        "048_tg_topic_archive.sql": "2026-07-02",
        "097_fizruk_injuries.sql": "2026-08-02",
        "096_finyk_fizruk_pk_text.sql": "2026-08-04",
      });
    },
    TIMEOUT_MS,
  );

  it(
    "одинак: запис переїжджає на теперішнє ім'я, applied_at справжній",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      await seed([
        ["047_tg_topic_archive.sql", "2026-07-01"],
        ["096_fizruk_injuries.sql", "2026-08-01"],
        ["097_finyk_fizruk_pk_text.sql", "2026-08-03"],
      ]);
      await runMigration();
      // Дати ті самі, що були в легасі-рядків, — факт застосування не втрачено
      // і не підмінено часом міграції.
      expect(await ledger()).toEqual({
        "048_tg_topic_archive.sql": "2026-07-01",
        "097_fizruk_injuries.sql": "2026-08-01",
        "096_finyk_fizruk_pk_text.sql": "2026-08-03",
      });
    },
    TIMEOUT_MS,
  );

  it(
    "свіжа база: жодного легасі-імені — чистий no-op",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      await seed([["001_init.sql", "2026-01-01"]]);
      await runMigration();
      expect(await ledger()).toEqual({ "001_init.sql": "2026-01-01" });
    },
    TIMEOUT_MS,
  );

  it(
    "бази без леджера не чіпає і не падає",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      // Рівно те, що робить `createIntegrationApp.ts::runMigrations`: свіжа
      // база, `.sql` напряму, жодного `schema_migrations`.
      await pool.query("DROP TABLE IF EXISTS schema_migrations");
      await expect(runMigration()).resolves.not.toThrow();
      const { rows } = await pool.query<{ present: boolean }>(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
      );
      // Міграція не має і СТВОРЮВАТИ леджер — це робота раннера.
      expect(rows[0]!.present).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    "повторний прогін нічого не змінює і не падає",
    async (ctx) => {
      if (!dockerAvailable || !pool) return void ctx.skip();
      await seed([
        ["047_tg_topic_archive.sql", "2026-07-01"],
        ["048_tg_topic_archive.sql", "2026-07-02"],
      ]);
      await runMigration();
      const afterFirst = await ledger();
      await runMigration();
      expect(await ledger()).toEqual(afterFirst);
    },
    TIMEOUT_MS,
  );
});
