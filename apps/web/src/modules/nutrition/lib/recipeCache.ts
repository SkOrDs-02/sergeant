/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { NUTRITION_RECIPES_CACHE_KEY } from "@sergeant/nutrition-domain";

import { normalizeFoodName } from "./pantryTextParser";

/**
 * Recipe cache lives in `sessionStorage` (per-tab) by design — AI-generated
 * recipes are throwaway suggestions tied to the current pantry exploration
 * session. `@shared/storage` is currently `localStorage`-only (Stage 9);
 * a `webSessionKVStore` adapter is tracked separately. Until then, route
 * all three session-storage touches through these helpers so quota /
 * blocked-by-extension failures collapse to a single try/catch point
 * (audit F9 — docs/audits/2026-05-13-page-audit-08-nutrition.md).
 */
function safeReadSessionRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteSessionRaw(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode / blocked-by-extension — swallow */
  }
}

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
  savedAt?: number | undefined;
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

export function readRecipeCache<TRecipe = unknown>(
  cacheKey: string,
): RecipeCacheEntry<TRecipe> | null {
  const raw = safeReadSessionRaw(NUTRITION_RECIPES_CACHE_KEY);
  if (!raw) return null;
  try {
    const all = JSON.parse(raw);
    if (!all || typeof all !== "object") return null;
    const entry = (all as Record<string, unknown>)[cacheKey] as
      | RecipeCacheEntry<TRecipe>
      | undefined;
    if (!entry || !Array.isArray(entry.recipes)) return null;
    return {
      recipes: entry.recipes,
      recipesRaw: typeof entry.recipesRaw === "string" ? entry.recipesRaw : "",
      savedAt: entry.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeRecipeCache<TRecipe = unknown>(
  cacheKey: string,
  { recipes, recipesRaw }: { recipes: TRecipe[]; recipesRaw?: string },
): void {
  const raw = safeReadSessionRaw(NUTRITION_RECIPES_CACHE_KEY);
  let all: Record<string, RecipeCacheEntry<TRecipe>> = {};
  if (raw) {
    try {
      all = (JSON.parse(raw) || {}) as Record<
        string,
        RecipeCacheEntry<TRecipe>
      >;
    } catch {
      all = {};
    }
  }
  all[cacheKey] = {
    recipes,
    recipesRaw: recipesRaw || "",
    savedAt: Date.now(),
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(all);
  } catch {
    return;
  }
  safeWriteSessionRaw(NUTRITION_RECIPES_CACHE_KEY, serialized);
}
