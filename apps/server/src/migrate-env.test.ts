// Гейт на три env-нормалізації у `apps/server/migrate.mjs`.
//
// Чому парсерний тест, а не поведінковий: `migrate.mjs` — це скрипт із
// top-level `await import("./src/db.ts")`, тобто імпортувати його в тесті
// означає підняти пул і полізти в базу. Форма ж тут і є контрактом —
// кожен із трьох рядків закриває свій спосіб мовчки заклинити деплой, і
// всі три легко «прибрати як зайві» при рефакторингу. Той самий підхід,
// що в `scripts/__tests__/ci-bundle-budget-gates.test.mjs`.
//
// Що саме ловиться, якщо рядок зникне:
//   - PG_STATEMENT_TIMEOUT_MS=0 → перша ж міграція, довша за 30 секунд,
//     обривається з 57014, деплой падає, ретрай падає так само.
//   - PG_LOCK_TIMEOUT_MS       → ALTER TABLE стає в чергу за довгим
//     читачем і блокує всі наступні запити до тієї таблиці.
//   - delete DATABASE_URL_POOL → міграції їдуть через pgBouncer у
//     transaction-mode, де `pg_advisory_lock` не тримається між
//     запитами, тобто захист від двох одночасних деплоїв зникає.
//
// Порядок теж частина контракту: усе це мусить статись ДО
// `await import("./src/db.ts")`, бо пул створюється на етапі eval модуля.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATE_MJS = path.resolve(__dirname, "..", "migrate.mjs");

let source = "";

beforeAll(async () => {
  source = await fs.readFile(MIGRATE_MJS, "utf8");
});

/** Код без коментарів — преамбула сама описує ці рядки словами. */
function codeOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("migrate.mjs — env-нормалізація release-stage", () => {
  it("знімає statement_timeout: довга міграція не має вбивати сама себе", () => {
    expect(codeOnly(source)).toMatch(
      /process\.env\.PG_STATEMENT_TIMEOUT_MS\s*=\s*["']0["']/,
    );
  });

  it("виставляє lock_timeout: DDL не має ставати в чергу безстроково", () => {
    expect(codeOnly(source)).toMatch(/process\.env\.PG_LOCK_TIMEOUT_MS\s*=/);
  });

  it("прибирає DATABASE_URL_POOL: міграції не їдуть через pgBouncer", () => {
    expect(codeOnly(source)).toMatch(
      /delete\s+process\.env\.DATABASE_URL_POOL/,
    );
  });

  it("усі три нормалізації стоять ДО імпорту db.ts", () => {
    const code = codeOnly(source);
    const importAt = code.search(/await\s+import\(["']\.\/src\/db\.ts["']\)/);
    expect(importAt).toBeGreaterThan(-1);

    for (const marker of [
      /process\.env\.PG_STATEMENT_TIMEOUT_MS\s*=/,
      /process\.env\.PG_LOCK_TIMEOUT_MS\s*=/,
      /delete\s+process\.env\.DATABASE_URL_POOL/,
    ]) {
      const at = code.search(marker);
      expect(at, `${marker} має стояти до import("./src/db.ts")`).toBeLessThan(
        importAt,
      );
    }
  });
});
