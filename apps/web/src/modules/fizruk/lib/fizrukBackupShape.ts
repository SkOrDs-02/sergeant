/**
 * Pure validation helpers for the fizruk backup payload shapes.
 *
 * The actual `read` / `write` lives in `fizrukStorage.ts` because it
 * needs the `fizrukStorage` instance. Keep these functions in a
 * dependency-free module so they stay trivially testable in isolation
 * and so the read-path code can reason about "valid → do X" without
 * splitting the predicate from the I/O call site.
 */

export const FIZRUK_BACKUP_KIND = "fizruk-backup" as const;
export const FIZRUK_FULL_BACKUP_KIND = "fizruk-full-backup" as const;

export interface FizrukBackupPayload {
  kind: typeof FIZRUK_BACKUP_KIND;
  workouts: unknown[];
  customExercises: unknown[];
}

export interface FizrukFullBackupEntry {
  [key: string]: string | null;
}

export interface FizrukFullBackupPayload {
  kind: typeof FIZRUK_FULL_BACKUP_KIND;
  data: FizrukFullBackupEntry;
}

function isStringOrNullRecord(
  value: unknown,
): value is Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const v of Object.values(value)) {
    if (v !== null && typeof v !== "string") return false;
  }
  return true;
}

export function isFizrukBackupShape(
  value: unknown,
): value is FizrukBackupPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as {
    kind?: unknown;
    workouts?: unknown;
    customExercises?: unknown;
  };
  if (v.kind !== FIZRUK_BACKUP_KIND) return false;
  if (!Array.isArray(v.workouts)) return false;
  if (!Array.isArray(v.customExercises)) return false;
  return true;
}

export function isFizrukFullBackupShape(
  value: unknown,
): value is FizrukFullBackupPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; data?: unknown };
  if (v.kind !== FIZRUK_FULL_BACKUP_KIND) return false;
  return isStringOrNullRecord(v.data);
}

export function assertFizrukBackupShape(value: unknown): FizrukBackupPayload {
  if (!isFizrukBackupShape(value)) {
    throw new Error("Невірний формат файлу");
  }
  return value;
}
