/**
 * MMKV-обгортка для нещодавніх запитів HubSearch (mobile).
 *
 * Pure-скорінг (`normalize`, `tokenize`, `scoreMatch`) живе у
 * `@sergeant/insights` і використовується тут і в web (див.
 * `apps/web/src/core/hub/hubSearchEngine.ts`). Цей файл — тонкий
 * MMKV-аналог web-обгортки `localStorage`: зберігає максимум
 * {@link RECENTS_CAP} останніх запитів під ключем `hub_search_recents_v1`,
 * щоб mobile/web ділили однакову структуру + бекап у Cloud Sync.
 */

import { safeReadLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";

export {
  normalize,
  tokenize,
  scoreMatch,
  scoreAndSort,
  type Scorable,
} from "@sergeant/insights";

/** Локальне сховище для недавніх запитів. Кап на 5 — щоб UI лишався легким. */
export const RECENTS_KEY = "hub_search_recents_v1";
export const RECENTS_CAP = 5;

export function getRecentQueries(): string[] {
  const arr = safeReadLS<unknown[]>(RECENTS_KEY);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v): v is string => typeof v === "string")
    .slice(0, RECENTS_CAP);
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
