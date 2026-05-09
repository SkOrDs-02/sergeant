/**
 * Boot-time residual-import helper for the mobile Nutrition MMKV keys.
 *
 * Stage 8 PR #057n-tombstone of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/nutrition/lib/residualImport.ts`).
 * Reads any leftover values from the now-deprecated MMKV keys
 * (`nutrition_log_v1`, `nutrition_pantries_v1`,
 * `nutrition_active_pantry_v1`, `nutrition_prefs_v1`), imports them
 * into the local `nutrition_*` SQLite tables (idempotent + LWW-safe),
 * and then deletes the MMKV entries. Subsequent boots no-op because
 * the MMKV keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  defaultNutritionPrefs,
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizePantries,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
} from "@sergeant/nutrition-domain";

import { safeReadLS, safeReadStringLS, safeRemoveLS } from "@/lib/storage";

import { applyNutritionDualWriteOps } from "./dualWrite/adapter";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
  type NutritionMealSnapshot,
  type NutritionPantrySnapshot,
} from "./dualWrite/diff";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const EMPTY_STATE: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
};

export interface ResidualImportResult {
  /** `true` when at least one MMKV key had data that was imported. */
  readonly imported: boolean;
  /** `true` when MMKV keys were present and have been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Nutrition MMKV data into SQLite, then delete the
 * MMKV entries. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importNutritionResidualFromMmkv(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const log = readLogFromMmkv();
  const pantries = readPantriesFromMmkv();
  const activePantryId = readActivePantryFromMmkv();
  const prefs = readPrefsFromMmkv();

  const hasAny =
    log !== null ||
    pantries !== null ||
    activePantryId !== null ||
    prefs !== null;
  if (!hasAny) return { imported: false, cleaned: false };

  // Build a NutritionDualWriteState from whatever was found in MMKV.
  // Slots that are missing fall back to the empty / default value so
  // the diff against `EMPTY_STATE` only emits ops for slots we have.
  const next: NutritionDualWriteState = {
    meals: log ? extractMealSnapshots(normalizeNutritionLog(log)) : [],
    pantries: pantries
      ? extractPantrySnapshots(normalizePantries(pantries))
      : [],
    prefs:
      prefs !== null || activePantryId !== null
        ? {
            prefsJson: JSON.stringify(
              prefs ? normalizeNutritionPrefs(prefs) : defaultNutritionPrefs(),
            ),
            activePantryId,
          }
        : null,
    recipes: [],
  };

  const ops = diffNutritionDualWriteOps(EMPTY_STATE, next);

  if (ops.length > 0) {
    try {
      await applyNutritionDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[nutrition.residualImport] apply failed; MMKV keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete the MMKV keys after a successful import. Done unconditionally
  // (i.e. even when ops.length === 0, e.g. MMKV held only an empty `{}`)
  // so a half-cleared MMKV state can't keep retriggering the import on
  // every boot.
  safeRemoveLS(NUTRITION_LOG_KEY);
  safeRemoveLS(NUTRITION_PANTRIES_KEY);
  safeRemoveLS(NUTRITION_ACTIVE_PANTRY_KEY);
  safeRemoveLS(NUTRITION_PREFS_KEY);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// MMKV readers — defensive: any throw collapses to `null` so the import
// proceeds with whatever else was readable.
// -----------------------------------------------------------------------

function readLogFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_LOG_KEY, null);
  } catch {
    return null;
  }
}

function readPantriesFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_PANTRIES_KEY, null);
  } catch {
    return null;
  }
}

function readActivePantryFromMmkv(): string | null {
  try {
    const raw = safeReadStringLS(NUTRITION_ACTIVE_PANTRY_KEY, null);
    return raw === null ? null : String(raw);
  } catch {
    return null;
  }
}

function readPrefsFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_PREFS_KEY, null);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Snapshot extractors — copies of the helpers that previously lived in
// `dualWriteState.ts` (private). The MMKV-read path that owned them is
// gone; the residual-import is the last consumer of the MMKV layout.
// -----------------------------------------------------------------------

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
  return pantries.map((p) => ({
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

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
  extractMealSnapshots,
  extractPantrySnapshots,
};

// Tell TS we use NutritionPrefs in the doc comment scope.
export type { NutritionPrefs };
