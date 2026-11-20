/**
 * Улюблені продукти й рецепти (OD-27 Х-3 б, рішення власника 2026-11-18;
 * спека `docs/work/specs/nutrition-favorites-and-time-of-day-sort.md`).
 *
 * Зберігаються в `nutrition_prefs.prefs_json` верхніми ключами
 * `favoriteFoodIds` і `favoriteRecipeIds`: prefs уже їдуть між пристроями
 * (sync v2, злиття за верхніми ключами), тож нова таблиця чи колонка не
 * потрібні. Порядок у списку — від найсвіжішої позначки.
 */

/**
 * Стеля списку. Та сама, що в шаблонів страв у тих самих prefs
 * (`mealTemplates.slice(0, 40)`, `nutritionPrefs.ts`): обидва живуть в одному
 * JSON-рядку, і безмежний список роздував би кожен синк prefs.
 */
export const FAVORITES_MAX = 40;

export function normalizeFavoriteIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}

/** Позначити або зняти. Нова позначка стає першою; переповнення витісняє найстарішу. */
export function toggleFavoriteId(
  list: readonly string[] | undefined,
  id: string,
): string[] {
  const key = String(id ?? "").trim();
  const current = normalizeFavoriteIds(list ?? []);
  if (!key) return current;
  if (current.includes(key)) return current.filter((x) => x !== key);
  return [key, ...current].slice(0, FAVORITES_MAX);
}

/**
 * Улюблені вгору списку, порядок усередині обох груп зберігається. Без
 * улюблених — той самий масив (стабільна посилка для мемоізації).
 */
export function sortFavoritesFirst<T>(
  items: readonly T[],
  favoriteIds: readonly string[] | ReadonlySet<string> | undefined,
  getId: (item: T) => unknown,
): readonly T[] {
  const set =
    favoriteIds instanceof Set
      ? (favoriteIds as ReadonlySet<string>)
      : new Set(favoriteIds ?? []);
  if (set.size === 0) return items;
  const fav: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const id = getId(item);
    (id != null && set.has(String(id)) ? fav : rest).push(item);
  }
  return fav.length === 0 ? items : [...fav, ...rest];
}
