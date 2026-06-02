import { useCallback, useEffect, useMemo, useState } from "react";
import { triggerFizrukDualWrite } from "../lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMeasurementSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

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

// F3: min/max bounds guard against out-of-range PII writes (e.g. NaN,
// negative weight, 99 999 kg). Browser `<input min max>` provides the UX
// hint; the zod schema in Measurements.tsx enforces it at submit time.
export const MEASURE_FIELDS = [
  { id: "weightKg", label: "Вага", unit: "кг", min: 20, max: 300 },
  { id: "bodyFatPct", label: "% жиру", unit: "%", min: 2, max: 70 },
  { id: "neckCm", label: "Шия", unit: "см", min: 20, max: 80 },
  { id: "chestCm", label: "Груди", unit: "см", min: 40, max: 200 },
  { id: "waistCm", label: "Талія", unit: "см", min: 30, max: 200 },
  { id: "hipsCm", label: "Стегна (обхват)", unit: "см", min: 40, max: 200 },
  { id: "bicepLCm", label: "Біцепс (Л)", unit: "см", min: 15, max: 80 },
  { id: "bicepRCm", label: "Біцепс (П)", unit: "см", min: 15, max: 80 },
  { id: "forearmLCm", label: "Передпліччя (Л)", unit: "см", min: 15, max: 60 },
  { id: "forearmRCm", label: "Передпліччя (П)", unit: "см", min: 15, max: 60 },
  { id: "thighLCm", label: "Стегно (Л)", unit: "см", min: 30, max: 120 },
  { id: "thighRCm", label: "Стегно (П)", unit: "см", min: 30, max: 120 },
  { id: "calfLCm", label: "Литка (Л)", unit: "см", min: 15, max: 80 },
  { id: "calfRCm", label: "Литка (П)", unit: "см", min: 15, max: 80 },
] as const;

/**
 * Stage 8 PR #057f-tombstone: measurements are sourced from the
 * SQLite cache (`fizruk_measurements` table) and persisted exclusively
 * through the dual-write pipeline. The legacy
 * `fizruk_measurements_v1` LS key is drained on first boot via
 * `importFizrukResidualFromLs` and removed.
 */
export function useMeasurements() {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [entries, setEntries] = useState<MeasurementEntry[]>(() => {
    const cache = getCachedFizrukSqliteState();
    return cache.refreshedAt === null
      ? []
      : (cache.measurements as MeasurementEntry[]);
  });

  // Overlay measurements from the SQLite cache once it's warm.
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setEntries(cache.measurements as MeasurementEntry[]);
  }, [sqliteCacheTick]);

  const persist = useCallback((next: MeasurementEntry[]) => {
    setEntries(next);
    const prevDualWrite =
      peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
    const nextDualWrite = {
      ...prevDualWrite,
      measurements: extractMeasurementSnapshots(next),
    };
    try {
      triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
    } catch {
      /* trigger is fire-and-forget — never propagate */
    }
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
