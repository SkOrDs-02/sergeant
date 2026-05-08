/**
 * Hub-level biometric parameters for nutrition / fitness calculations.
 *
 * Lives in Profile (not in Fizruk) so a user without the Fizruk module
 * still has the inputs needed for BMR / TDEE — the user's own
 * requirement when shaping the storage layer (see
 * `biometrics-storage-plan.md`). Persisted under
 * `STORAGE_KEYS.HUB_BIOMETRICS` (`hub_biometrics_v1`); cross-device
 * sync rides the existing `SYNC_MODULES.profile` LWW path next to the
 * memory bank.
 *
 * Weight is treated as the canonical "current weight" snapshot for
 * Nutrition (Mifflin-St Jeor uses one number, not a time-series).
 * Fizruk Body keeps the historical journal (`fizruk_daily_log_v1`
 * entries). The two stay in lockstep:
 *
 *   - Profile → Fizruk: `BiometricsSection` calls
 *     `useDailyLog.addEntry({ weightKg })` on save when weight
 *     changes — going through the canonical fizruk hook keeps the
 *     SQLite overlay (PR #030, storage-roadmap) transparent.
 *   - Fizruk → Profile: `useDailyLog.addEntry` calls
 *     `mirrorWeightToBiometrics` whenever an entry includes
 *     `weightKg`, updating the hub-level snapshot in place.
 *
 * Both directions converge on Last-Write-Wins via `weightUpdatedAt`,
 * matching CloudSync's per-module LWW for the merged Profile blob.
 */
import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";

export const BIOMETRICS_KEY = STORAGE_KEYS.HUB_BIOMETRICS;

export const SEX_VALUES = ["male", "female"] as const;
export type Sex = (typeof SEX_VALUES)[number];

/**
 * Mifflin-St Jeor 5-tier activity ladder (sedentary → very_active).
 * Multipliers live in the Nutrition consumer (PR #2) — this module only
 * persists the chosen tier name so the calculation lives next to the
 * formula, not the storage key.
 */
export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

const SexSchema = z.enum(SEX_VALUES).nullable();
const ActivityLevelSchema = z.enum(ACTIVITY_LEVELS).nullable();
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();
const IsoTimestampSchema = z.string().min(1);

export const BiometricsSchema = z.object({
  heightCm: z.number().min(80).max(260).nullable(),
  birthDate: IsoDateSchema,
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  weightKg: z.number().min(20).max(400).nullable(),
  /**
   * ISO timestamp when `weightKg` was last set. Used as the LWW marker
   * for Profile ↔ Fizruk weight sync — the latest write wins,
   * regardless of which surface initiated it.
   */
  weightUpdatedAt: IsoTimestampSchema.nullable(),
  /** ISO timestamp of the last write to ANY field in this record. */
  updatedAt: IsoTimestampSchema,
});

export type Biometrics = z.infer<typeof BiometricsSchema>;

const EPOCH = new Date(0).toISOString();

export const BIOMETRICS_DEFAULT: Biometrics = {
  heightCm: null,
  birthDate: null,
  sex: null,
  activityLevel: null,
  weightKg: null,
  weightUpdatedAt: null,
  updatedAt: EPOCH,
};

export function readBiometrics(): Biometrics {
  return safeReadLSValidated(
    BIOMETRICS_KEY,
    BiometricsSchema,
    BIOMETRICS_DEFAULT,
  );
}

/**
 * Same-tab subscribers — `webKVStore.onChange` only fires on cross-tab
 * writes when the underlying adapter is `localStorage` (DOM contract).
 * The SQLite-backed adapter does fire on same-tab writes, but tests
 * and any code path that runs before `bootstrapKvStore()` finishes
 * still need a bridge so a Fizruk Body weigh-in immediately re-renders
 * a Profile section that's currently mounted.
 */
type BiometricsListener = (next: Biometrics) => void;
const biometricsListeners = new Set<BiometricsListener>();

export function subscribeBiometrics(listener: BiometricsListener): () => void {
  biometricsListeners.add(listener);
  return () => {
    biometricsListeners.delete(listener);
  };
}

export function writeBiometrics(b: Biometrics): void {
  safeWriteLS(BIOMETRICS_KEY, b);
  for (const listener of Array.from(biometricsListeners)) {
    try {
      listener(b);
    } catch {
      /* listener errors must not break storage writes */
    }
  }
}

/**
 * Update biometrics from a Fizruk-side weight write — `useDailyLog.addEntry`
 * calls this whenever a daily-log entry includes `weightKg`. Last-Write-Wins:
 * the caller's `at` becomes the new `weightUpdatedAt`, regardless of any
 * older value already in biometrics. CloudSync's LWW will then resolve
 * cross-device conflicts on the merged Profile blob.
 */
export function mirrorWeightToBiometrics(
  weightKg: number,
  at: string = new Date().toISOString(),
): void {
  const cur = readBiometrics();
  if (cur.weightKg === weightKg && cur.weightUpdatedAt === at) return;
  writeBiometrics({
    ...cur,
    weightKg,
    weightUpdatedAt: at,
    updatedAt: at,
  });
}

/**
 * Persist a partial update to biometrics — non-weight fields (or weight
 * itself, if the caller is the canonical Profile writer). The helper
 * auto-bumps `updatedAt`, and bumps `weightUpdatedAt` when `weightKg`
 * is part of the patch (presence-checked via `hasOwnProperty` so an
 * explicit `weightKg: null` "clear" still bumps the LWW marker).
 *
 * The Fizruk daily-log mirror lives in `BiometricsSection` (calls
 * `useDailyLog.addEntry`) — this module no longer owns that
 * dual-write so it doesn't have to reach for the retired
 * `STORAGE_KEYS.FIZRUK_DAILY_LOG` directly (PR #030, storage-roadmap).
 */
export function writeBiometricsPatch(
  patch: Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">>,
  at: string = new Date().toISOString(),
): Biometrics {
  const cur = readBiometrics();
  const weightChanged = Object.prototype.hasOwnProperty.call(patch, "weightKg");
  const merged: Biometrics = {
    ...cur,
    ...patch,
    weightUpdatedAt: weightChanged ? at : cur.weightUpdatedAt,
    updatedAt: at,
  };
  writeBiometrics(merged);
  return merged;
}

/**
 * Compute the user's age (whole years) from their birth-date as of `now`.
 * Returns `null` when birth-date is missing — Nutrition uses this to
 * decide whether it can compute BMR yet.
 */
export function computeAgeYears(
  birthDate: string | null,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const bd = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(bd.getTime())) return null;
  let age = now.getUTCFullYear() - bd.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < bd.getUTCMonth() ||
    (now.getUTCMonth() === bd.getUTCMonth() &&
      now.getUTCDate() < bd.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * `true` when biometrics has every field needed to run the Mifflin-St
 * Jeor formula (used by Nutrition in PR #2 to enable the
 * "Розрахувати з профілю" CTA).
 */
export function isBiometricsCompleteForTdee(b: Biometrics): boolean {
  return (
    b.heightCm != null &&
    b.weightKg != null &&
    b.sex != null &&
    b.activityLevel != null &&
    computeAgeYears(b.birthDate) != null
  );
}
