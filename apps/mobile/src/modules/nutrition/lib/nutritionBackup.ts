/**
 * Mobile Nutrition — backup payload helpers.
 *
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` — mirror of
 * `apps/web/src/modules/nutrition/domain/nutritionBackup.ts`. Reads
 * via the SQLite warm cache (`loadNutritionLog` / `loadNutritionPrefs` /
 * `loadActivePantryId` / `loadPantries`); writes via the dual-write
 * triggers (`saveNutritionLog` / `saveNutritionPrefs` /
 * `saveActivePantryId` / `savePantries`). After Stage 8 PR
 * #057n-tombstone-mobile the MMKV slots are empty, so the prior
 * direct-MMKV pass-through in `hubBackup.ts` was a no-op on import and
 * a stale read on export. Mirroring web's pattern restores parity.
 */

import {
  defaultNutritionPrefs,
  normalizeNutritionLog,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
  type PantryItem,
} from "@sergeant/nutrition-domain";

import {
  loadActivePantryId,
  loadNutritionLog,
  loadNutritionPrefs,
  loadPantries,
  saveActivePantryId,
  saveNutritionLog,
  saveNutritionPrefs,
  savePantries,
} from "./nutritionStore";

export const NUTRITION_BACKUP_KIND = "hub-nutrition-backup";
export const NUTRITION_BACKUP_SCHEMA_VERSION = 1;

export interface NutritionBackupData {
  stateSchemaVersion: 1;
  pantries: Pantry[];
  activePantryId: string;
  prefs: NutritionPrefs;
  log: NutritionLog | Record<string, unknown>;
}

export interface NutritionBackupPayload {
  kind: typeof NUTRITION_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  data: NutritionBackupData;
}

function safeString(x: unknown, fallback = ""): string {
  return x == null ? fallback : String(x);
}

function safeNumber(x: unknown, fallback: number | null = null): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function optionalPositiveNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizePantryItem(x: unknown): PantryItem | null {
  if (!x || typeof x !== "object") return null;
  const rec = x as Record<string, unknown>;
  const name = safeString(rec.name, "").trim();
  if (!name) return null;
  const qty =
    rec.qty == null || rec.qty === "" ? null : safeNumber(rec.qty, null);
  const unit =
    rec.unit == null || rec.unit === ""
      ? null
      : safeString(rec.unit, "").trim();
  const notes =
    rec.notes == null || rec.notes === ""
      ? null
      : safeString(rec.notes, "").trim();
  return { name, qty, unit, notes };
}

function normalizePantry(x: unknown): Pantry | null {
  if (!x || typeof x !== "object") return null;
  const rec = x as Record<string, unknown>;
  const id = safeString(rec.id, "").trim();
  const name = safeString(rec.name, "").trim() || "Склад";
  const text = safeString(rec.text, "");
  const items = Array.isArray(rec.items)
    ? rec.items
        .map(normalizePantryItem)
        .filter((v): v is PantryItem => v != null)
    : [];
  return { id: id || `p_${Date.now()}`, name, text, items };
}

function normalizePrefs(x: unknown): NutritionPrefs {
  if (!x || typeof x !== "object" || Array.isArray(x))
    return defaultNutritionPrefs();
  const p = { ...defaultNutritionPrefs(), ...(x as Partial<NutritionPrefs>) };
  return {
    goal: p.goal ? String(p.goal) : "balanced",
    servings: safeNumber(p.servings, 1) || 1,
    timeMinutes: safeNumber(p.timeMinutes, 25) || 25,
    exclude: p.exclude == null ? "" : String(p.exclude),
    dailyTargetKcal: optionalPositiveNumber(p.dailyTargetKcal),
    dailyTargetProtein_g: optionalPositiveNumber(p.dailyTargetProtein_g),
    dailyTargetFat_g: optionalPositiveNumber(p.dailyTargetFat_g),
    dailyTargetCarbs_g: optionalPositiveNumber(p.dailyTargetCarbs_g),
    mealTemplates: Array.isArray(p.mealTemplates)
      ? p.mealTemplates.slice(0, 40)
      : [],
    reminderEnabled: Boolean(p.reminderEnabled),
    reminderHour:
      p.reminderHour != null && Number.isFinite(Number(p.reminderHour))
        ? Math.min(23, Math.max(0, Math.floor(Number(p.reminderHour))))
        : 12,
    waterGoalMl:
      p.waterGoalMl != null && Number.isFinite(Number(p.waterGoalMl))
        ? Math.max(0, Math.floor(Number(p.waterGoalMl)))
        : 2000,
  };
}

/**
 * Read every Nutrition slot from the SQLite warm cache and return a
 * cross-platform-compatible backup payload. Pre-boot, the loaders fall
 * back to a default pantry / empty log / default prefs so the payload
 * still validates on the receiving side.
 */
export function buildNutritionBackupPayload(): NutritionBackupPayload {
  const pantries = loadPantries();
  const activePantryId = safeString(loadActivePantryId(), "home") || "home";
  const prefs = loadNutritionPrefs();
  const log = loadNutritionLog();

  return {
    kind: NUTRITION_BACKUP_KIND,
    schemaVersion: NUTRITION_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      stateSchemaVersion: 1,
      pantries: Array.isArray(pantries)
        ? pantries.map(normalizePantry).filter((v): v is Pantry => v != null)
        : [],
      activePantryId,
      prefs: normalizePrefs(prefs),
      log: log && typeof log === "object" && !Array.isArray(log) ? log : {},
    },
  };
}

/**
 * Apply a Nutrition backup payload. Routes each slice through the
 * mobile dual-write pipeline so the SQLite tables become source of
 * truth and the hooks pick up the restored state on next overlay tick.
 */
export function applyNutritionBackupPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Некоректний бекап харчування.");
  }
  const p = payload as Record<string, unknown>;
  if (p.kind !== NUTRITION_BACKUP_KIND) {
    throw new Error("Некоректний тип бекапу харчування.");
  }
  if (typeof p.schemaVersion !== "number") {
    throw new Error("Некоректна версія схеми бекапу харчування.");
  }
  const data = p.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Некоректні дані бекапу харчування.");
  }

  const normalizedPantries = Array.isArray(data.pantries)
    ? data.pantries.map(normalizePantry).filter((v): v is Pantry => v != null)
    : [];
  const activePantryId = safeString(data.activePantryId, "home") || "home";
  const prefs = normalizePrefs(data.prefs);

  // Pantries write piggy-backs the active-pantry id in the same op so
  // the dual-write trigger sees both fields move together.
  savePantries(normalizedPantries, activePantryId);
  saveActivePantryId(activePantryId);
  saveNutritionPrefs(prefs);
  if (data.log && typeof data.log === "object" && !Array.isArray(data.log)) {
    saveNutritionLog(normalizeNutritionLog(data.log));
  }
}
