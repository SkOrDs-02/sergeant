/**
 * Гейт від дрейфу: список таблиць в експорті проти живих міграцій.
 *
 * Навіщо. `MODULE_EXPORT_TABLES` — статичний список саме тому, що вміст
 * найчутливішого файлу продукту має читатись очима в ревʼю. Ціна статики —
 * вона тихо відстає: нова таблиця модуля зʼявиться в базі, а людина її в
 * експорті не отримає і не дізнається про це. Цей тест і є та ціна,
 * сплачена один раз.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_EXPORT_TABLES } from "./dataRights.js";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "migrations");
const MODULE_TABLE_RE = /^(finyk|fizruk|nutrition|routine)_/;

/** Таблиці, які існують у базі, але свідомо не їдуть у файл. */
const DELIBERATELY_EXCLUDED = new Set([
  // Знімки стану модуля, не первинні записи (рішення власника, раунд 3).
  "nutrition_backups",
]);

function liveModuleTables(): Set<string> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  const live = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?"?([a-z0-9_]+)"?/gi,
    )) {
      const name = match[1];
      if (name && MODULE_TABLE_RE.test(name)) live.add(name);
    }
    for (const match of sql.matchAll(
      /DROP TABLE (?:IF EXISTS )?"?([a-z0-9_]+)"?/gi,
    )) {
      if (match[1]) live.delete(match[1]);
    }
  }
  return live;
}

describe("MODULE_EXPORT_TABLES проти міграцій", () => {
  it("покриває кожну живу таблицю чотирьох модулів", () => {
    const exported = new Set<string>([
      ...Object.values(MODULE_EXPORT_TABLES).flat(),
      // Без власного `user_id`, тому окремим запитом із join на `receipts`.
      "finyk_tx_receipt_links",
    ]);

    const missing = [...liveModuleTables()]
      .filter((t) => !exported.has(t) && !DELIBERATELY_EXCLUDED.has(t))
      .sort();

    expect(missing).toEqual([]);
  });

  it("не тягне таблиць, яких у базі вже немає", () => {
    const live = liveModuleTables();
    const dead = Object.values(MODULE_EXPORT_TABLES)
      .flat()
      .filter((t) => !live.has(t))
      .sort();

    // `routine_pushups` (міграція 139) і `fizruk_pushups` (140) — рівно той
    // випадок, який тут ловиться.
    expect(dead).toEqual([]);
  });
});
