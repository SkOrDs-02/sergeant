/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Який VFS обслуговує локальну базу — окремим модулем, без жодної ваги.
 *
 * AI-DANGER: цей файл навмисно НЕ імпортує ні `sqlite.ts`, ні drizzle, ні
 * `@sergeant/db-schema`. Читачі цього значення — легкі UI-поверхні
 * (аркуш «Синхронізація»), а `sqlite.ts` статично тягне `drizzle-orm` і
 * табличні визначення схеми. Один eager-імпорт звідти кладе весь
 * `drizzle-orm` на критичний шлях — саме той механізм, яким свого часу
 * `vendor-sqlite` важив 69 kB в eager-графі (див. root `AGENTS.md`
 * § Performance budgets, ратчет 2026-08-07). Тому стан живе тут: писар
 * (`sqlite.ts`) знає про цей модуль, читачі про писаря не знають.
 */

/** Назви VFS, які вміє відкрити `sqlite.ts`. */
export type SqliteVfsName = "opfs-sahpool" | "kvvfs" | "memory";

let activeVfs: SqliteVfsName | null = null;

/** Викликає `sqlite.ts` одразу після відкриття бази. */
export function noteActiveSqliteVfs(vfs: SqliteVfsName): void {
  activeVfs = vfs;
}

/** VFS відкритої бази, або `null` доки її не відкривали. */
export function readActiveSqliteVfs(): SqliteVfsName | null {
  return activeVfs;
}

/** Test-only. */
export function __resetActiveSqliteVfsForTests(): void {
  activeVfs = null;
}
