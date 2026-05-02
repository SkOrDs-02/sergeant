/**
 * Web-обгортка для глобального пошуку.
 *
 * Pure-скорінг (нормалізація, токенізація, scoreMatch/scoreAndSort) винесений
 * у `@sergeant/insights/search` — його шерить майбутній `apps/mobile`
 * (див. docs/mobile/react-native-migration.md §11, R2). Тут лишилися тільки
 * функції поверх `localStorage` — зберігання останніх запитів. Вони навмисно
 * НЕ переносяться у пакет: `@sergeant/insights` має бути DOM-free.
 */

import { safeReadLS, safeWriteLS, safeRemoveLS } from "@shared/lib/storage";

export {
  normalize,
  tokenize,
  scoreMatch,
  scoreAndSort,
  type Scorable,
} from "@sergeant/insights";

/** Локальне сховище для недавніх запитів. Кап на 5 — щоб UI лишався легким. */
const RECENTS_KEY = "hub_search_recents_v1";
const RECENTS_CAP = 5;

export function getRecentQueries(): string[] {
  const arr = safeReadLS<unknown[]>(RECENTS_KEY);
  if (!Array.isArray(arr)) return [];
  return arr.filter((v) => typeof v === "string").slice(0, RECENTS_CAP);
}

export function pushRecentQuery(q: string): string[] {
  const norm = q.trim();
  if (!norm) return getRecentQueries();
  const current = getRecentQueries();
  const next = [norm, ...current.filter((v) => v !== norm)].slice(
    0,
    RECENTS_CAP,
  );
  safeWriteLS(RECENTS_KEY, next);
  return next;
}

export function clearRecentQueries(): void {
  safeRemoveLS(RECENTS_KEY);
}
