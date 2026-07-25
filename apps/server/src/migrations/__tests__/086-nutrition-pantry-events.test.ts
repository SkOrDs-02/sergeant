// Migration 086 — `nutrition_pantry_events` (W1-PANTRY-APPEND, стадія 1).
//
// Чому цей тест НЕ на Testcontainers, на відміну від 061/058.
// -----------------------------------------------------------
// Реальний прогін DDL (up → down → up на живому Postgres) уже покриває
// `rollback-sanity.test.ts`: він застосовує ВСІ forward-міграції, знімає
// відбиток схеми, прокручує всі `.down.sql` у зворотному порядку і звіряє
// відбиток після re-apply. Дублювати це третім контейнером — лише плюс
// півтори хвилини до CI без нової інформації.
//
// Те, чого відбиток схеми НЕ ловить і що ловить цей файл, — намір:
// міграція мусить лишитись ADDITIVE (Hard Rule #4), id-колонки мусять
// лишитись TEXT, а CHECK-и — на місці. Усе це перевіряється статично, тож
// тест дає сигнал і на машині без Docker (де testcontainers-тести
// soft-skip-аються і мовчки нічого не доводять).

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP = path.join(MIGRATIONS_DIR, "086_nutrition_pantry_events.sql");
const DOWN = path.join(MIGRATIONS_DIR, "086_nutrition_pantry_events.down.sql");

let up = "";
let down = "";

beforeAll(async () => {
  up = await fs.readFile(UP, "utf8");
  down = await fs.readFile(DOWN, "utf8");
});

/** SQL без коментарів — щоб `-- DROP …` у преамбулі не ламав перевірки. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/**
 * Тіло `CREATE TABLE (...)` — саме оголошення колонок.
 *
 * Потрібне окремо від `statementsOnly`, бо `COMMENT ON …` — це теж
 * інструкція, і слово «UUID» у пояснювальному тексті коментаря не має
 * зараховуватись як UUID-колонка.
 */
function createTableBody(sql: string): string {
  const match =
    /CREATE TABLE IF NOT EXISTS nutrition_pantry_events\s*\(([\s\S]*?)\n\);/.exec(
      statementsOnly(sql),
    );
  if (!match) throw new Error("CREATE TABLE block not found in migration 086");
  return match[1]!;
}

describe("086 — форма таблиці", () => {
  it("створює nutrition_pantry_events ідемпотентно", () => {
    expect(up).toMatch(/CREATE TABLE IF NOT EXISTS nutrition_pantry_events/);
  });

  it("тримає id/pantry_id/item_id/meal_id як TEXT, а не UUID", () => {
    // AI-DANGER: клієнт генерує НЕ-UUID id (`home`, `p_<ms>_<idx>`,
    // `<pantryId>::<idx>::<name>` — див. nutritionStorage.extractPantrySnapshots).
    // UUID-колонка дала б 22P02 → apply_failed на кожному реальному push-і,
    // рівно як у docs/90-work/tech-debt/backend.md § «Routine: PK-тип».
    const body = createTableBody(up);
    expect(body).toMatch(/id\s+TEXT PRIMARY KEY/);
    expect(body).toMatch(/pantry_id\s+TEXT NOT NULL/);
    expect(body).toMatch(/item_id\s+TEXT/);
    expect(body).toMatch(/meal_id\s+TEXT/);
    expect(body).not.toMatch(/\bUUID\b/);
  });

  it("тримає FK лише на user(id) — на pantries FK неможливий (TEXT vs UUID)", () => {
    const body = createTableBody(up);
    expect(body).toMatch(/REFERENCES "user"\(id\) ON DELETE CASCADE/);
    expect(body).not.toMatch(/REFERENCES nutrition_pantries/);
    expect(body).not.toMatch(/REFERENCES nutrition_pantry_items/);
  });

  it("закриває kind enum-ом CHECK", () => {
    expect(statementsOnly(up)).toMatch(
      /CHECK \(kind IN \('consume', 'replenish', 'adjust', 'initial'\)\)/,
    );
  });

  it("вимагає delta_qty для дельт і abs_qty для чекпойнтів", () => {
    // Без цього CHECK-у в журнал міг би лягти рядок, який не згортається
    // в число, — позиція з назавжди невідомим залишком.
    const body = statementsOnly(up);
    expect(body).toMatch(/CONSTRAINT nutrition_pantry_events_qty_shape CHECK/);
    expect(body).toMatch(
      /kind IN \('consume', 'replenish'\) AND delta_qty IS NOT NULL/,
    );
    expect(body).toMatch(
      /kind IN \('adjust', 'initial'\) AND abs_qty IS NOT NULL/,
    );
  });

  it("несе item_key — ключ згортки, стійкий до перейменування позиції", () => {
    expect(statementsOnly(up)).toMatch(/item_key\s+TEXT NOT NULL/);
  });
});

describe("086 — індекси", () => {
  it("створює композитний індекс під згортку по позиції", () => {
    expect(up).toMatch(
      /CREATE INDEX IF NOT EXISTS nutrition_pantry_events_user_item_idx\s*\n\s*ON nutrition_pantry_events \(user_id, pantry_id, item_key, occurred_at\)/,
    );
  });

  it("створює частковий індекс по живих подіях", () => {
    expect(up).toMatch(
      /CREATE INDEX IF NOT EXISTS nutrition_pantry_events_user_active_idx[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });
});

describe("086 — Hard Rule #4: міграція чисто additive", () => {
  it("не робить ЖОДНОГО ALTER — зокрема над nutrition_pantry_items", () => {
    // Лічильник `qty` лишається єдиним джерелом залишку на стадії 1.
    // Найгірший можливий регрес цієї хвилі — «заодно» підправити стару
    // таблицю і зламати робочий шлях.
    expect(statementsOnly(up)).not.toMatch(/\bALTER TABLE\b/);
  });

  it("не робить DROP у forward-міграції", () => {
    expect(statementsOnly(up)).not.toMatch(/\bDROP\b/);
  });

  it("не чіпає жодну існуючу nutrition-таблицю", () => {
    const body = statementsOnly(up);
    for (const table of [
      "nutrition_pantry_items",
      "nutrition_pantries",
      "nutrition_meals",
      "nutrition_prefs",
    ]) {
      // Назви можуть згадуватись лише в COMMENT-тексті, не в DDL-операції.
      expect(body).not.toMatch(
        new RegExp(`(ALTER|DROP|UPDATE|DELETE FROM|INSERT INTO)\\s+${table}`),
      );
    }
  });

  it("не робить backfill — стартові чекпойнти це стадія 2", () => {
    expect(statementsOnly(up)).not.toMatch(/INSERT INTO/);
  });
});

describe("086 — down-міграція", () => {
  it("існує і прибирає рівно ту таблицю, яку створила", () => {
    expect(down).toMatch(/DROP TABLE IF EXISTS nutrition_pantry_events;/);
  });

  it("не відкочує нічого чужого", () => {
    const body = statementsOnly(down);
    expect(body).not.toMatch(/nutrition_pantry_items/);
    expect(body).not.toMatch(/ALTER TABLE/);
  });
});

describe("086 — документованість", () => {
  it("має COMMENT ON TABLE, що фіксує стадію 1 і append-only-інваріант", () => {
    expect(up).toMatch(/COMMENT ON TABLE nutrition_pantry_events IS/);
    expect(up).toMatch(/NEITHER WRITTEN NOR READ as of stage 1/);
    expect(up).toMatch(/append_only_violation/);
  });

  it("пояснює семантику delta/abs/item_key/deleted_at у COMMENT ON COLUMN", () => {
    for (const column of ["item_key", "delta_qty", "abs_qty", "deleted_at"]) {
      expect(up).toMatch(
        new RegExp(`COMMENT ON COLUMN nutrition_pantry_events\\.${column} IS`),
      );
    }
  });
});
