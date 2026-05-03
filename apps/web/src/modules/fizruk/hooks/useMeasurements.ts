import { useCallback, useEffect, useMemo, useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import {
  useFizrukSqliteReadFlag,
  useFizrukSqliteReadTick,
} from "../lib/sqliteReadGate";

const KEY = STORAGE_KEYS.FIZRUK_MEASUREMENTS;

export type MeasurementFieldId =
  | "weightKg"
  | "bodyFatPct"
  | "neckCm"
  | "chestCm"
  | "waistCm"
  | "hipsCm"
  | "bicepLCm"
  | "bicepRCm"
  | "forearmLCm"
  | "forearmRCm"
  | "thighLCm"
  | "thighRCm"
  | "calfLCm"
  | "calfRCm";

export interface MeasurementEntry {
  id: string;
  at: string;
  [field: string]: number | string | undefined;
}

function uid() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const MEASURE_FIELDS = [
  { id: "weightKg", label: "Вага", unit: "кг" },
  { id: "bodyFatPct", label: "% жиру", unit: "%" },
  { id: "neckCm", label: "Шия", unit: "см" },
  { id: "chestCm", label: "Груди", unit: "см" },
  { id: "waistCm", label: "Талія", unit: "см" },
  { id: "hipsCm", label: "Стегна (обхват)", unit: "см" },
  { id: "bicepLCm", label: "Біцепс (Л)", unit: "см" },
  { id: "bicepRCm", label: "Біцепс (П)", unit: "см" },
  { id: "forearmLCm", label: "Передпліччя (Л)", unit: "см" },
  { id: "forearmRCm", label: "Передпліччя (П)", unit: "см" },
  { id: "thighLCm", label: "Стегно (Л)", unit: "см" },
  { id: "thighRCm", label: "Стегно (П)", unit: "см" },
  { id: "calfLCm", label: "Литка (Л)", unit: "см" },
  { id: "calfRCm", label: "Литка (П)", unit: "см" },
];

export function useMeasurements() {
  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const sqliteReadEnabled = useFizrukSqliteReadFlag();
  const sqliteCacheTick = useFizrukSqliteReadTick();

  useEffect(() => {
    const parsed = safeReadLS(KEY, []);
    if (Array.isArray(parsed)) setEntries(parsed);
  }, []);

  // Stage 4 PR #029: under `feature.fizruk.sqlite_v2.read_sqlite`,
  // overlay measurements from the SQLite cache once it's warm.
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setEntries(cache.measurements);
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const persist = useCallback((next: MeasurementEntry[]) => {
    setEntries(next);
    safeWriteLS(KEY, next);
  }, []);

  const addEntry = useCallback(
    (entry: Partial<MeasurementEntry>): MeasurementEntry => {
      const e: MeasurementEntry = {
        ...entry,
        id: uid(),
        at: new Date().toISOString(),
      };
      persist([e, ...entries]);
      return e;
    },
    [persist, entries],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [persist, entries],
  );

  /**
   * Re-insert a previously deleted measurement, preserving the original
   * `id` and `at` timestamp. Used by undo flows after `deleteEntry`.
   */
  const restoreEntry = useCallback(
    (entry: MeasurementEntry | null | undefined) => {
      if (!entry || !entry.id) return;
      persist(
        entries.some((e) => e.id === entry.id) ? entries : [entry, ...entries],
      );
    },
    [persist, entries],
  );

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  }, [entries]);

  return { entries: sorted, addEntry, deleteEntry, restoreEntry };
}
