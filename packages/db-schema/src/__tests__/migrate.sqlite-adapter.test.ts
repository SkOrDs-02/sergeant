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
