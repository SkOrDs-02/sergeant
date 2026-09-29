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

// База відкривається вже після першого рендера (а при зависанні воркера і
// через 30+ с), тож банер «дані не збережуться» мусить дізнатись про VFS
// підпискою, а не читанням на рендері, як аркуш «Синхронізація».
const listeners = new Set<() => void>();

/** Підписка для `useSyncExternalStore`. */
export function subscribeActiveSqliteVfs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Викликає `sqlite.ts` одразу після відкриття бази. */
export function noteActiveSqliteVfs(vfs: SqliteVfsName): void {
  activeVfs = vfs;
  for (const listener of listeners) listener();
}

/**
 * Чому база НЕ дісталась OPFS, коли не дісталась.
 *
 * `pool-busy` - каталог пулу вже тримає інша вкладка того самого профілю:
 * SAH-пул бере sync-хендли на ВЕСЬ каталог, не на один файл, тож друга
 * вкладка не дістає жодного слота. Це єдина причина, яку людина може
 * усунути сама, тому вона й доїжджає до аркуша «Синхронізація» окремим
 * рядком замість глухого «Лише памʼять».
 */
export type SqliteVfsFallbackReason = "pool-busy";

let fallbackReason: SqliteVfsFallbackReason | null = null;

/** Викликає `sqlite.ts`, коли OPFS не дістався з відомої причини. */
export function noteSqliteVfsFallbackReason(
  reason: SqliteVfsFallbackReason,
): void {
  fallbackReason = reason;
}

/** Причина фолбеку, або `null`. */
export function readSqliteVfsFallbackReason(): SqliteVfsFallbackReason | null {
  return fallbackReason;
}

/** VFS відкритої бази, або `null` доки її не відкривали. */
export function readActiveSqliteVfs(): SqliteVfsName | null {
  return activeVfs;
}

/** Test-only. */
export function __resetActiveSqliteVfsForTests(): void {
  activeVfs = null;
  fallbackReason = null;
}
