import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";

export const TREND_STORAGE_PREFIX = "fizruk:body:trend-open:";
export const JOURNAL_OPEN_STORAGE_KEY = "fizruk:body:journal-open";
export const JOURNAL_ENTRY_OPEN_PREFIX = "fizruk:body:journal-entry-open:";

export type JournalEntry = {
  id: string;
  at: string;
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  moodScore: number | null;
  note: string;
};

export function readTrendOpen(key: string): boolean {
  return safeReadStringLS(TREND_STORAGE_PREFIX + key) === "1";
}

export function readPersistedOpen(
  storageKey: string,
  fallback: boolean,
): boolean {
  const v = safeReadStringLS(storageKey);
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

export function writePersistedOpen(storageKey: string, open: boolean): void {
  safeWriteLS(storageKey, open ? "1" : "0");
}
