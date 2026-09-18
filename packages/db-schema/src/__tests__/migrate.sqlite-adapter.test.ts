import { describe, expect, it } from "vitest";

import { createSqliteAdapter } from "../migrate/adapters/sqlite.js";
import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Гонка «вкладена транзакція» на СПІЛЬНОМУ DB-хендлі.
 *
 * Знайдено аудитом Фізрука (L-9, 2026-08-07): бут падав із
 * `Migration "001_fizruk_tables.sql" failed: cannot start a transaction
 * within a transaction`, модуль тихо лишався на LS-фолбеку. Корінь — не
 * SQL міграції (він чистий `CREATE TABLE IF NOT EXISTS`), а те, що
 * `applyMigration` тримає `await` між `BEGIN` і `COMMIT`, а чотири
 * модульні мігратори веба стартують із бут-ефектів одного рендеру над
 * одним `oo1.DB`.
 *
 * Фейк нижче поводиться як справжній sqlite: другий `BEGIN` без `COMMIT`
 * кидає ту саму помилку. Асинхронна пауза в `exec` моделює віддачу
 * керування циклу подій — без неї гонка в тесті не відтворюється, бо
 * все злипається в один мікротаск.
 */
interface FakeSqlite {
  client: SqliteMigrationClient;
  log: string[];
  maxDepth: number;
}

function makeFakeSqlite(): FakeSqlite {
  let depth = 0;
  const state: FakeSqlite = {
    log: [],
    maxDepth: 0,
    client: {
      async exec(sql: string) {
        const head = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
        if (head === "BEGIN") {
          if (depth > 0) {
            throw new Error("cannot start a transaction within a transaction");
          }
          depth += 1;
          state.maxDepth = Math.max(state.maxDepth, depth);
        } else if (head === "COMMIT" || head === "ROLLBACK") {
          depth = Math.max(0, depth - 1);
        }
        state.log.push(head === "" ? sql.trim() : head);
        // Пауза саме тут: між `BEGIN` і `COMMIT` реальний клієнт теж
        // віддає керування, і саме в це вікно вклинювався чужий `BEGIN`.
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
      async run() {
        await Promise.resolve();
      },
      async all() {
        await Promise.resolve();
        return [];
      },
    },
  };
  return state;
}

describe("createSqliteAdapter — серіалізація на спільному клієнті", () => {
  it("не вкладає BEGIN, коли два мігратори йдуть паралельно на одному клієнті", async () => {
    const fake = makeFakeSqlite();
    // Два адаптери, як два модульні мігратори — але клієнт один і той
    // самий обʼєкт, бо `migrationClient()` мемоізовано на хендлі.
    const first = createSqliteAdapter(fake.client);
    const second = createSqliteAdapter(fake.client);

    await Promise.all([
      first.applyMigration("__migrations", "001_fizruk_tables.sql", "SELECT 1"),
      second.applyMigration(
        "__migrations",
        "001_routine_tables.sql",
        "SELECT 2",
      ),
    ]);

    expect(fake.maxDepth).toBe(1);
    expect(fake.log.filter((entry) => entry === "BEGIN")).toHaveLength(2);
    expect(fake.log.filter((entry) => entry === "COMMIT")).toHaveLength(2);
  });

  it("провалена міграція не блокує чергу для наступної", async () => {
    const fake = makeFakeSqlite();
    const adapter = createSqliteAdapter(fake.client);
    // Черга будується через `then(task, task)` саме заради цього: якби
    // ланцюг ішов лише по успішній гілці, перший же провалений модуль
    // назавжди зупинив би бут решти трьох.
    const boom = new Error("forced failure");
    const inner = fake.client.exec.bind(fake.client);
    fake.client.exec = async (sql: string) => {
      if (sql === "BOOM") throw boom;
      return inner(sql);
    };

    const failing = adapter.applyMigration(
      "__migrations",
      "001_bad.sql",
      "BOOM",
    );
    const following = adapter.applyMigration(
      "__migrations",
      "002_good.sql",
      "SELECT 1",
    );

    await expect(failing).rejects.toThrow("forced failure");
    await expect(following).resolves.toBeUndefined();
    // Друга справді дійшла до кінця, а не просто «не впала».
    expect(fake.log.filter((entry) => entry === "COMMIT")).toHaveLength(1);
    expect(fake.log).toContain("ROLLBACK");
    expect(fake.maxDepth).toBe(1);
  });

  it("черга привʼязана до клієнта, а не до адаптера", async () => {
    // Два РІЗНІ клієнти — різні хендли, тож серіалізувати їх між собою
    // не треба й не можна: інакше бут одного користувача чекав би на
    // інший без причини.
    const a = makeFakeSqlite();
    const b = makeFakeSqlite();

    await Promise.all([
      createSqliteAdapter(a.client).applyMigration("__migrations", "x", "S"),
      createSqliteAdapter(b.client).applyMigration("__migrations", "y", "S"),
    ]);

    expect(a.maxDepth).toBe(1);
    expect(b.maxDepth).toBe(1);
  });
});

/**
 * Гонка «два хендли на одній фізичній базі».
 *
 * `withClientLock` серіалізує по обʼєкту клієнта — але не по файлу бази.
 * Два штатні стани дають різні клієнти поверх ОДНІЄЇ БД: kvvfs-фолбек
 * (старий iOS Safari) тримає всі партиції в одному фізичному файлі, а
 * перемикання анон→юзер відкриває свіжий хендл. Обидва прогони раннера
 * знімають порожній леджер, перший комітить міграцію, другий доходить до
 * `INSERT` і ловить `UNIQUE constraint failed: __migrations.name` —
 * `SERGEANT-API-V`, 4 користувачі, серпень 2026. Тіло міграції тут ні до
 * чого: воно ідемпотентне, падає саме запис у леджер.
 *
 * Фейк моделює спільний леджер із UNIQUE на `name` і двома окремими
 * клієнтськими обʼєктами над ним.
 */
function makeSharedLedgerDb() {
  const ledger: string[] = [];
  let bodyRuns = 0;

  // Транзакційна глибина — ПО КЛІЄНТУ, не по базі: два хендли на одному
  // файлі — це дві незалежні конекції, кожна зі своїм станом транзакції.
  // Спільний у них лише леджер, і саме на ньому UNIQUE і спрацьовував.
  const makeClient = (): SqliteMigrationClient => {
    let depth = 0;
    return {
      async exec(sql: string) {
        const head = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
        if (head === "BEGIN") {
          if (depth > 0) {
            throw new Error("cannot start a transaction within a transaction");
          }
          depth += 1;
        } else if (head === "COMMIT" || head === "ROLLBACK") {
          depth = Math.max(0, depth - 1);
        } else {
          bodyRuns += 1;
        }
        await Promise.resolve();
      },
      async run(_sql: string, params: readonly unknown[]) {
        await Promise.resolve();
        const name = String(params[0]);
        if (ledger.includes(name)) {
          throw new Error("UNIQUE constraint failed: __migrations.name");
        }
        ledger.push(name);
      },
      async all<R extends Record<string, unknown> = Record<string, unknown>>(
        _sql: string,
        params?: readonly unknown[],
      ) {
        await Promise.resolve();
        const name = params ? String(params[0]) : "";
        return (ledger.includes(name) ? [{ name }] : []) as unknown as R[];
      },
    };
  };

  return {
    clientA: makeClient(),
    clientB: makeClient(),
    ledger,
    bodyRuns: () => bodyRuns,
  };
}

describe("createSqliteAdapter — два хендли на одній базі", () => {
  it("програвший гонку хендл не валиться UNIQUE, а стає no-op", async () => {
    const db = makeSharedLedgerDb();
    const winner = createSqliteAdapter(db.clientA);
    const loser = createSqliteAdapter(db.clientB);

    // Прод-послідовність: перший хендл уже закомітив міграцію…
    await winner.applyMigration(
      "__migrations",
      "001_routine_spike.sql",
      "CREATE TABLE IF NOT EXISTS t (id)",
    );
    // …а другий несе ЇЇ Ж, бо його раннер зняв `appliedSet` іще порожнім.
    await expect(
      loser.applyMigration(
        "__migrations",
        "001_routine_spike.sql",
        "CREATE TABLE IF NOT EXISTS t (id)",
      ),
    ).resolves.toBeUndefined();

    // Леджер чистий: рівно один запис, без дублів.
    expect(db.ledger).toEqual(["001_routine_spike.sql"]);
    // Тіло міграції не проганялось удруге — програвший саме no-op, а не
    // «застосував ще раз і мовчки проковтнув конфлікт».
    expect(db.bodyRuns()).toBe(1);
  });

  it("різні міграції на двох хендлах застосовуються обидві", async () => {
    const db = makeSharedLedgerDb();
    const a = createSqliteAdapter(db.clientA);
    const b = createSqliteAdapter(db.clientB);

    await Promise.all([
      a.applyMigration("__migrations", "001_routine_spike.sql", "SELECT 1"),
      b.applyMigration("__migrations", "002_sync_op_outbox_retry.sql", "S 2"),
    ]);

    expect([...db.ledger].sort()).toEqual([
      "001_routine_spike.sql",
      "002_sync_op_outbox_retry.sql",
    ]);
    expect(db.bodyRuns()).toBe(2);
  });

  it("справжня помилка міграції все одно кидається", async () => {
    const db = makeSharedLedgerDb();
    const adapter = createSqliteAdapter(db.clientA);

    await expect(
      adapter.applyMigration("__migrations", "003_bad.sql", "BOOM"),
    ).resolves.toBeUndefined();
    // Перевірка вище — контроль: фейк не кидає на довільному SQL. Тепер
    // ламаємо `run`, щоб переконатись, що фікс не ковтає НЕ-benign збої.
    const broken = createSqliteAdapter({
      ...db.clientB,
      run: async () => {
        await Promise.resolve();
        throw new Error("disk I/O error");
      },
    });
    await expect(
      broken.applyMigration("__migrations", "004_other.sql", "SELECT 1"),
    ).rejects.toThrow("disk I/O error");
  });
});
