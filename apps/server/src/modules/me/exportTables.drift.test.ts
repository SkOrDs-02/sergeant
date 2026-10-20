/**
 * Гейт від дрейфу: список таблиць в експорті проти живих міграцій.
 *
 * Навіщо. `MODULE_EXPORT_TABLES` і `EXPORT_EXPLICIT_TABLES` — статичні списки
 * саме тому, що вміст найчутливішого файлу продукту має читатись очима в
 * ревʼю. Ціна статики: вона тихо відстає. Нова таблиця зʼявиться в базі, а
 * людина її в експорті не отримає і не дізнається про це.
 *
 * До priv-12 (аудит 2026-10-01) гейт дивився лише на префікси
 * `finyk_/fizruk_/nutrition_/routine_`, тож `user_profile`, `receipts`,
 * `silpo_*`, `feedback_entries` та інші без префікса випадали з файлу мовчки.
 * Тепер правило загальне: КОЖНА жива таблиця з колонкою `user_id` (або
 * `"userId"` у Better Auth) мусить бути або у файлі, або в `EXPORT_EXCLUSIONS`
 * з причиною для людини. Окремого allowlist-а винятків у цьому тесті немає:
 * виключення живуть у самому файлі експорту, тож гейт і те, що бачить
 * людина, не можуть розійтися.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPORT_EXCLUSIONS,
  EXPORT_EXPLICIT_TABLES,
  MODULE_EXPORT_TABLES,
} from "./exportBuilder.js";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "migrations");
const MODULE_TABLE_RE = /^(finyk|fizruk|nutrition|routine)_/;
const OWNER_COLUMN_RE = /^(user_id|userId)$/;

interface LiveTable {
  columns: Set<string>;
}

/** Розбір DDL міграцій: живі таблиці та їхні колонки (CREATE/ALTER/DROP). */
function liveTables(): Map<string, LiveTable> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  const live = new Map<string, LiveTable>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(
      /--[^\n]*/g,
      "",
    );
    const create = /CREATE TABLE (?:IF NOT EXISTS )?"?([a-zA-Z0-9_]+)"?\s*\(/g;
    for (let m = create.exec(sql); m; m = create.exec(sql)) {
      const name = m[1];
      if (!name) continue;
      let depth = 1;
      let i = create.lastIndex;
      while (depth > 0 && i < sql.length) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") depth--;
        i++;
      }
      const body = sql.slice(create.lastIndex, i - 1);
      const entry = live.get(name) ?? { columns: new Set<string>() };
      for (const part of body.split(/,\s*\n/)) {
        const col = part
          .trim()
          .match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+[a-zA-Z]/);
        if (col?.[1]) entry.columns.add(col[1]);
      }
      live.set(name, entry);
    }
    // Перейменування таблиць (єдиний випадок у історії: 042 піднімає
    // `module_data_partitioned` під імʼям `module_data`, яке потім дропає 046).
    for (const rename of sql.matchAll(
      /ALTER TABLE (?:IF EXISTS )?"?([a-zA-Z0-9_]+)"?\s+RENAME TO "?([a-zA-Z0-9_]+)"?/g,
    )) {
      const [, from, to] = rename;
      const entry = from ? live.get(from) : undefined;
      if (from && to && entry) {
        live.delete(from);
        live.set(to, entry);
      }
    }
    const alter =
      /ALTER TABLE (?:IF EXISTS )?(?:ONLY )?"?([a-zA-Z0-9_]+)"?\s+([^;]*);/g;
    for (let m = alter.exec(sql); m; m = alter.exec(sql)) {
      const entry = m[1] ? live.get(m[1]) : undefined;
      if (!entry) continue;
      for (const add of (m[2] ?? "").matchAll(
        /ADD COLUMN (?:IF NOT EXISTS )?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/g,
      )) {
        if (add[1]) entry.columns.add(add[1]);
      }
    }
    for (const drop of sql.matchAll(
      /DROP TABLE (?:IF EXISTS )?"?([a-zA-Z0-9_]+)"?/g,
    )) {
      if (drop[1]) live.delete(drop[1]);
    }
  }
  return live;
}

const EXPORTED = new Set<string>([
  ...Object.values(MODULE_EXPORT_TABLES).flat(),
  ...EXPORT_EXPLICIT_TABLES,
]);
const EXCLUDED = new Set<string>(EXPORT_EXCLUSIONS.flatMap((e) => e.tables));

describe("парсер міграцій гейта", () => {
  it("бачить таблиці з user_id і Better Auth-колонку userId", () => {
    const owned = [...liveTables()]
      .filter(([, t]) => [...t.columns].some((c) => OWNER_COLUMN_RE.test(c)))
      .map(([name]) => name);
    // Страховка від мовчазного нуля: якщо парсер зламається, гейт нижче
    // стане порожнім і зеленим.
    expect(owned).toEqual(
      expect.arrayContaining([
        "user_profile",
        "receipts",
        "silpo_receipts",
        "feedback_entries",
        "session",
        "routine_habits",
      ]),
    );
    expect(owned.length).toBeGreaterThan(40);
  });
});

describe("експорт проти міграцій", () => {
  it("кожна жива таблиця з user_id є у файлі або у виключеннях із причиною", () => {
    const missing = [...liveTables()]
      .filter(([, t]) => [...t.columns].some((c) => OWNER_COLUMN_RE.test(c)))
      .map(([name]) => name)
      .filter((name) => !EXPORTED.has(name) && !EXCLUDED.has(name))
      .sort();

    // Нова таблиця з даними людини: або додай явний запит у
    // `exportBuilder.ts` (з переліком колонок, без секретів), або внеси її в
    // `EXPORT_EXCLUSIONS` з причиною для людини.
    expect(missing).toEqual([]);
  });

  it("покриває кожну живу таблицю чотирьох модулів", () => {
    const missing = [...liveTables().keys()]
      .filter((t) => MODULE_TABLE_RE.test(t))
      .filter((t) => !EXPORTED.has(t) && !EXCLUDED.has(t))
      .sort();

    expect(missing).toEqual([]);
  });

  it("не тягне таблиць, яких у базі вже немає", () => {
    const live = liveTables();
    const dead = [...EXPORTED].filter((t) => !live.has(t)).sort();

    // `routine_pushups` (міграція 139) і `fizruk_pushups` (140) — рівно той
    // випадок, який тут ловиться.
    expect(dead).toEqual([]);
  });

  it("виключення не називають таблиць, яких у базі вже немає", () => {
    const live = liveTables();
    const stale = [...EXCLUDED].filter((t) => !live.has(t)).sort();

    expect(stale).toEqual([]);
  });

  it("таблиця не може бути одночасно у файлі й у виключеннях", () => {
    const both = [...EXCLUDED].filter((t) => EXPORTED.has(t)).sort();

    expect(both).toEqual([]);
  });
});
