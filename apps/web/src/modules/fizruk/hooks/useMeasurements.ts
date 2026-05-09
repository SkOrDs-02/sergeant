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
