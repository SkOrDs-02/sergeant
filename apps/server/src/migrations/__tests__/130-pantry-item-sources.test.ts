// Migration 130 — `nutrition_pantry_items.sources` (картка продукту комори).
//
// Чому статичний тест, а не Testcontainers: реальний прогін DDL
// (up → down → up на живому Postgres) уже покриває `rollback-sanity.test.ts`.
// Відбиток схеми не ловить НАМІР — що міграція має лишитись additive-only
// (Hard Rule #4), а колонка nullable. Саме це й перевіряється тут, і сигнал
// приходить навіть на машині без Docker, де testcontainers-тести
// soft-skip-аються.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP = path.join(MIGRATIONS_DIR, "130_pantry_item_sources.sql");
const DOWN = path.join(MIGRATIONS_DIR, "130_pantry_item_sources.down.sql");

let up = "";
let down = "";

beforeAll(async () => {
  up = await fs.readFile(UP, "utf8");
  down = await fs.readFile(DOWN, "utf8");
});

/** SQL без коментарів — щоб слово «DROP» у преамбулі не ламало перевірки. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("130 — форма колонки", () => {
  it("додає `sources` ідемпотентно", () => {
    expect(statementsOnly(up)).toMatch(
      /ALTER TABLE nutrition_pantry_items\s+ADD COLUMN IF NOT EXISTS sources TEXT;/,
    );
  });

  it("колонка nullable і без DEFAULT — NULL означає «варіантів немає»", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/sources TEXT[^;]*NOT NULL/i);
    expect(body).not.toMatch(/sources TEXT[^;]*DEFAULT/i);
  });

  it("additive-only: жодного DROP / RENAME / зміни типу (Hard Rule #4)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bRENAME\b/i);
    expect(body).not.toMatch(/ALTER COLUMN/i);
  });

  it("не чіпає жодної таблиці, крім nutrition_pantry_items", () => {
    const tables = [
      ...statementsOnly(up).matchAll(/ALTER TABLE\s+(\w+)/gi),
    ].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["nutrition_pantry_items"]));
  });

  it("документує інваріант суми в COMMENT — саме він робить число чесним", () => {
    expect(up).toMatch(/COMMENT ON COLUMN nutrition_pantry_items\.sources/);
    expect(up).toMatch(/base unit/i);
  });
});

describe("130 — down", () => {
  it("знімає рівно ту колонку, яку додав", () => {
    expect(statementsOnly(down)).toMatch(
      /ALTER TABLE nutrition_pantry_items\s+DROP COLUMN IF EXISTS sources;/,
    );
  });

  it("не чіпає нічого іншого", () => {
    const body = statementsOnly(down);
    expect(body).not.toMatch(/DROP TABLE/i);
    expect(body.match(/ALTER TABLE/gi)?.length ?? 0).toBe(1);
  });
});
