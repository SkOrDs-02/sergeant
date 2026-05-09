/**
 * MMKV-backed storage adapter for the mobile Nutrition module.
 *
 * Mirrors the shape of `apps/web/src/modules/nutrition/lib/*Storage.ts`
 * (Phase 7 / PR 2). All normalization / mutation logic is delegated to
 * `@sergeant/nutrition-domain` so mobile and web share the exact same
 * `NutritionLog` / `Pantry` / `WaterLog` / `ShoppingList` / `Prefs`
 * semantics — one domain change, both platforms updated.
 *
 * Stage 8 PR #057n-tombstone (`docs/planning/storage-roadmap.md`): the
 * `load*` / `save*` helpers for nutrition log / prefs / pantries no
 * longer touch MMKV. Reads come from the SQLite warm cache populated
 * at boot by `useNutritionSqliteReadBoot`, and writes go through the
 * dual-write pipeline (`triggerNutritionDualWrite`) which mirrors to
 * SQLite and bumps the cache. The MMKV-resident water and shopping
 * stores are unchanged — they still live in MMKV.
 */
import {
  SHOPPING_LIST_KEY,
  WATER_LOG_KEY,
  defaultNutritionPrefs,
  makeDefaultPantry,
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizePantries,
  normalizeShoppingList,
  normalizeWaterLog,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
  type ShoppingList,
  type WaterLog,
} from "@sergeant/nutrition-domain";

import { safeReadLS, safeWriteLS } from "@/lib/storage";

import {
  triggerNutritionDualWrite,
  type NutritionDualWriteState,
} from "./dualWrite";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
} from "./dualWrite/diff";
import { peekNutritionDualWriteState } from "./dualWriteState";
import { getCachedNutritionSqliteState } from "./sqliteReader";

// ── Log ─────────────────────────────────────────────────────────────

export function loadNutritionLog(): NutritionLog {
  // Stage 8 PR #057n-tombstone: read from the SQLite warm cache. Pre-boot
  // the cache returns `EMPTY_CACHE.log = {}` (empty object); the hook
  // overlay re-renders once the cache warms via `useNutritionSqliteReadTick`.
  const cache = getCachedNutritionSqliteState();
  return normalizeNutritionLog(cache.log);
}

export function saveNutritionLog(
  log: NutritionLog | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    meals: extractMealSnapshots(normalizeNutritionLog(log ?? {})),
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

// ── Prefs ───────────────────────────────────────────────────────────

export function loadNutritionPrefs(): NutritionPrefs {
  // Stage 8 PR #057n-tombstone: read from the SQLite warm cache.
  const cache = getCachedNutritionSqliteState();
  return cache.prefs
    ? normalizeNutritionPrefs(cache.prefs)
    : defaultNutritionPrefs();
}

export function saveNutritionPrefs(
  prefs: NutritionPrefs | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    prefs: {
      prefsJson: JSON.stringify(prefs || defaultNutritionPrefs()),
      activePantryId: prev.prefs?.activePantryId ?? null,
    },
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

// ── Pantries ────────────────────────────────────────────────────────

export function loadActivePantryId(): string {
  // Stage 8 PR #057n-tombstone: read from the SQLite warm cache.
  const cache = getCachedNutritionSqliteState();
  return cache.activePantryId ?? "home";
}

export function saveActivePantryId(id: string): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    prefs: {
      prefsJson:
        prev.prefs?.prefsJson ?? JSON.stringify(defaultNutritionPrefs()),
      activePantryId: String(id || "home"),
    },
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

export function loadPantries(): Pantry[] {
  // Stage 8 PR #057n-tombstone: read from the SQLite warm cache. When
  // the cache is empty (fresh user, or boot not yet complete) return a
  // single in-memory default pantry so the UI has something to render —
  // the first user mutation will dual-write it via `savePantries`.
  const cache = getCachedNutritionSqliteState();
  if (cache.pantries.length > 0) return cache.pantries;
  return [makeDefaultPantry()];
}

export function savePantries(
  pantries: Pantry[] | null | undefined,
  activeId?: string | null,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const nextPantries: Pantry[] = Array.isArray(pantries) ? pantries : [];
  const nextActive: string | null = activeId ? String(activeId) : null;
  const next: NutritionDualWriteState = {
    ...prev,
    pantries: extractPantrySnapshots(nextPantries),
    prefs: {
      prefsJson:
        prev.prefs?.prefsJson ?? JSON.stringify(defaultNutritionPrefs()),
      activePantryId: nextActive ?? prev.prefs?.activePantryId ?? null,
    },
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

// Suppress unused-import warning — still re-exported for type-only callers.
export type { NutritionDualWriteState };

// ── Snapshot extractors (private; mirror `nutritionStorage.ts` web) ──

function extractMealSnapshots(log: NutritionLog): NutritionMealSnapshot[] {
  const out: NutritionMealSnapshot[] = [];
  for (const [dateKey, day] of Object.entries(log)) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      if (!m || typeof m !== "object" || !m.id) continue;
      out.push({
        id: String(m.id),
        dateKey,
        time: typeof m.time === "string" ? m.time : "",
        mealType: typeof m.mealType === "string" ? m.mealType : "snack",
        name: typeof m.name === "string" ? m.name : "",
        label: typeof m.label === "string" ? m.label : "",
        macros: m.macros ?? null,
        source: typeof m.source === "string" ? m.source : "manual",
        macroSource:
          typeof m.macroSource === "string" ? m.macroSource : "manual",
        amountG: typeof m.amount_g === "number" ? m.amount_g : null,
        foodId: typeof m.foodId === "string" ? m.foodId : null,
        isDemo: m.demo === true,
      });
    }
  }
  return out;
}

function extractPantrySnapshots(
  pantries: readonly Pantry[],
): NutritionPantrySnapshot[] {
  return normalizePantries(pantries).map((p) => ({
    id: p.id,
    name: p.name,
    text: p.text,
    items: (p.items ?? []).map((it, idx) => ({
      id: `${p.id}::${idx}::${it.name ?? ""}`,
      name: it.name,
      qty: typeof it.qty === "number" ? it.qty : null,
      unit: typeof it.unit === "string" ? it.unit : null,
      notes: typeof it.notes === "string" ? it.notes : null,
    })),
  }));
}

// ── Water ───────────────────────────────────────────────────────────

export function loadWaterLog(): WaterLog {
  return normalizeWaterLog(safeReadLS<unknown>(WATER_LOG_KEY, null));
}

export function saveWaterLog(log: unknown): boolean {
  return safeWriteLS(WATER_LOG_KEY, normalizeWaterLog(log));
}

// ── Shopping list ───────────────────────────────────────────────────

export function loadShoppingList(): ShoppingList {
  return normalizeShoppingList(safeReadLS<unknown>(SHOPPING_LIST_KEY, null));
}

export function saveShoppingList(list: unknown): boolean {
  return safeWriteLS(SHOPPING_LIST_KEY, normalizeShoppingList(list));
}
