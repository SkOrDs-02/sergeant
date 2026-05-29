/**
 * Session-кеш AI-рекомендацій рецептів (mobile).
 *
 * Web-аналог (`apps/web/.../lib/recipeCache.ts`) тримає кеш у
 * `sessionStorage`, який браузер чистить на закриття вкладки. У RN такого
 * scope немає — MMKV персистить між запусками. Щоб не показувати «свіжий»
 * кеш через години, ми додаємо TTL: запис старший за {@link CACHE_TTL_MS}
 * вважається застарілим і не повертається (risk «MMKV cache TTL persists
 * across backgrounding» зі специфікації).
 *
 * Ключ кеша (`buildRecipeCacheKey`) — це хеш `activePantryId` + нормалізовані
 * назви продуктів + prefs. Алгоритм shortHash збігається з web, тож логіка
 * інвалідації ідентична: зміна складу або налаштувань → новий ключ → кеш
 * не показується.
 */
import { normalizeFoodName } from "@sergeant/nutrition-domain";

import { safeReadLS, safeWriteLS } from "@/lib/storage";

const STORAGE_KEY = "mobile:nutrition_recipe_cache_v1";

/** 30 хвилин — після цього кеш сеансу вважається протухлим. */
export const CACHE_TTL_MS = 30 * 60 * 1000;

function shortHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface RecipeCachePrefs {
  goal?: unknown;
  servings?: unknown;
  timeMinutes?: unknown;
  exclude?: unknown;
}

export interface RecipeCacheEntry<TRecipe = unknown> {
  recipes: TRecipe[];
  recipesRaw: string;
  savedAt?: number;
}

export function buildRecipeCacheKey(
  activePantryId: string,
  effectiveItems: ReadonlyArray<{ name?: unknown }>,
  prefs: RecipeCachePrefs | null | undefined,
): string {
  const names = effectiveItems
    .map((x) => normalizeFoodName(x?.name))
    .filter(Boolean)
    .sort();
  const prefStr = [
    prefs?.goal,
    prefs?.servings,
    prefs?.timeMinutes,
    String(prefs?.exclude || ""),
  ].join("|");
  const raw = `${activePantryId}\n${names.join("\n")}\n${prefStr}`;
  return shortHash(raw);
}

/**
 * Повертає кеш для ключа або `null`, якщо запису немає / він протух
 * (`savedAt` старший за {@link CACHE_TTL_MS}). TTL-перевірка — mobile-only
 * (web покладається на ефемерний sessionStorage).
 */
export function readRecipeCache<TRecipe = unknown>(
  cacheKey: string,
): RecipeCacheEntry<TRecipe> | null {
  const all = safeReadLS<Record<string, RecipeCacheEntry<TRecipe>>>(
    STORAGE_KEY,
    null,
  );
  if (!all || typeof all !== "object") return null;
  const entry = all[cacheKey];
  if (!entry || !Array.isArray(entry.recipes)) return null;
  if (
    typeof entry.savedAt === "number" &&
    Date.now() - entry.savedAt > CACHE_TTL_MS
  ) {
    return null;
  }
  return {
    recipes: entry.recipes,
    recipesRaw: typeof entry.recipesRaw === "string" ? entry.recipesRaw : "",
    savedAt: entry.savedAt,
  };
}

export function writeRecipeCache<TRecipe = unknown>(
  cacheKey: string,
  { recipes, recipesRaw }: { recipes: TRecipe[]; recipesRaw?: string },
): void {
  const all =
    safeReadLS<Record<string, RecipeCacheEntry<TRecipe>>>(STORAGE_KEY, null) ??
    {};
  all[cacheKey] = {
    recipes,
    recipesRaw: recipesRaw || "",
    savedAt: Date.now(),
  };
  safeWriteLS(STORAGE_KEY, all);
}
