/**
 * Mobile hub backup — build / apply a cross-platform JSON payload.
 *
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` rewrote this
 * module to mirror the web pattern (`apps/web/src/core/hub/hubBackup.ts`):
 * each module's reads come from its SQLite warm cache via the
 * canonical `loadXxxState` / `buildXxxBackupPayload` helpers, and each
 * module's writes go through the dual-write trigger via
 * `applyXxxBackupPayload`. The on-disk file format is unchanged so
 * a backup file from web and one from mobile are byte-compatible.
 *
 * Why this matters: after Stage 8 PR #057{r,f,n,k}-tombstone-mobile
 * and Stage 12 / 12.5 fizruk tombstones, the MMKV slots this module
 * used to read are empty. Any direct `safeReadLS(STORAGE_KEYS.…)`
 * call returned stale data on export and any `safeWriteLS(…)`
 * never reached the SQLite tables hooks consume — round-trip
 * export → import → reboot lost every Routine / Fizruk / Nutrition /
 * Finyk row. The delegating pattern keeps SQLite the source of truth
 * end-to-end.
 */

import { STORAGE_KEYS } from "@sergeant/shared";
import {
  normalizeFinykBackup,
  type FinykBackup,
} from "@sergeant/finyk-domain/backup";

import { safeReadStringLS, safeWriteLS } from "@/lib/storage";

import {
  persistFinykNormalizedToStorage,
  readFinykBackupFromCache,
} from "@/modules/finyk/lib/finykBackup";
import {
  applyFizrukFullBackupPayload,
  buildFizrukFullBackupPayload,
} from "@/modules/fizruk/lib/fizrukBackup";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
} from "@/modules/nutrition/lib/nutritionBackup";
import {
  applyRoutineBackupPayload,
  buildRoutineBackupPayload,
} from "@/modules/routine/lib/routineBackup";

export const HUB_BACKUP_KIND = "hub-backup";
export const HUB_BACKUP_SCHEMA_VERSION = 1;

interface HubBackupPayload {
  kind: typeof HUB_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  finyk: unknown;
  fizruk: unknown;
  routine: unknown;
  nutrition: unknown;
  hub?: { lastModule?: string };
}

export function buildHubBackupPayload(): HubBackupPayload {
  let finyk: unknown;
  try {
    finyk = normalizeFinykBackup(readFinykBackupFromCache());
  } catch {
    finyk = readFinykBackupFromCache();
  }

  const hub: Record<string, string> = {};
  const lastModule = safeReadStringLS(STORAGE_KEYS.LAST_MODULE, null);
  if (lastModule) hub.lastModule = lastModule;

  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    finyk,
    fizruk: buildFizrukFullBackupPayload(),
    routine: buildRoutineBackupPayload(),
    nutrition: buildNutritionBackupPayload(),
    hub: Object.keys(hub).length ? hub : undefined,
  };
}

export function isHubBackupPayload(
  parsed: unknown,
): parsed is HubBackupPayload {
  return (
    parsed != null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).kind === HUB_BACKUP_KIND &&
    typeof (parsed as Record<string, unknown>).schemaVersion === "number"
  );
}

export function applyHubBackupPayload(parsed: unknown): void {
  if (!isHubBackupPayload(parsed)) {
    throw new Error("Некоректний файл резервної копії Hub.");
  }

  // Finyk — normalize then dual-write through the canonical slice helpers.
  if (parsed.finyk && typeof parsed.finyk === "object") {
    try {
      const normalized = normalizeFinykBackup(parsed.finyk) as FinykBackup;
      persistFinykNormalizedToStorage(normalized);
    } catch {
      // Backup payload not parseable as Finyk shape — skip. Other
      // modules still apply.
    }
  }

  // Routine — module-level apply normalises + persists via SQLite
  // dual-write. Wrapped in try/catch so a malformed routine slice
  // doesn't abort the whole hub-import path.
  if (
    parsed.routine &&
    typeof parsed.routine === "object" &&
    (parsed.routine as Record<string, unknown>).kind === "hub-routine-backup"
  ) {
    try {
      applyRoutineBackupPayload(parsed.routine);
    } catch {
      /* skip — partial hub apply is intentional */
    }
  }

  // Fizruk — module-level apply parses each slot and triggers a single
  // dual-write batch covering workouts / measurements / custom-exercises
  // / templates / monthly-plan; the still-MMKV-only selected-template
  // slot is also restored.
  if (
    parsed.fizruk &&
    typeof parsed.fizruk === "object" &&
    (parsed.fizruk as Record<string, unknown>).kind === "fizruk-full-backup"
  ) {
    try {
      applyFizrukFullBackupPayload(parsed.fizruk);
    } catch {
      /* skip — partial hub apply is intentional */
    }
  }

  // Nutrition — module-level apply routes each slice through dual-write
  // (`savePantries` / `saveActivePantryId` / `saveNutritionPrefs` /
  // `saveNutritionLog`).
  if (
    parsed.nutrition &&
    typeof parsed.nutrition === "object" &&
    (parsed.nutrition as Record<string, unknown>).kind ===
      "hub-nutrition-backup"
  ) {
    try {
      applyNutritionBackupPayload(parsed.nutrition);
    } catch {
      /* skip — partial hub apply is intentional */
    }
  }

  // Hub meta — `lastModule` is still a regular MMKV slot.
  if (parsed.hub && typeof parsed.hub === "object") {
    const h = parsed.hub;
    if (h.lastModule) {
      safeWriteLS(STORAGE_KEYS.LAST_MODULE, h.lastModule);
    }
  }
}
