import { useCallback, useMemo } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
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
  // Canonical measurement fields — all optional (a single entry may record
  // only a subset of measurements).
  weightKg?: number;
  bodyFatPct?: number;
  neckCm?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  bicepLCm?: number;
  bicepRCm?: number;
  forearmLCm?: number;
  forearmRCm?: number;
  thighLCm?: number;
  thighRCm?: number;
  calfLCm?: number;
  calfRCm?: number;
  // Index signature retained for structural compatibility with
  // @sergeant/fizruk-domain MeasurementEntry (which the dual-write pipeline
  // and sqlite reader rely on) and to allow runtime field access via f.id.
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
  const [entries, setEntries] = useSqliteTickOverlay<MeasurementEntry[]>(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null
        ? undefined
        : (cache.measurements as MeasurementEntry[]);
    },
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null
        ? []
        : (cache.measurements as MeasurementEntry[]);
    },
  );

  const persist = useCallback(
    (next: MeasurementEntry[]) => {
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
    },
    [setEntries],
  );

  const addEntry = useCallback(
    (entry: Partial<MeasurementEntry>): MeasurementEntry => {
      // F3: strip any field whose value is NaN or outside the declared
      // min/max bounds, so the dual-write pipeline can never receive
      // out-of-range PII even when called programmatically.
      const sanitised: Partial<MeasurementEntry> = {};
      for (const f of MEASURE_FIELDS) {
        const raw = entry[f.id as MeasurementFieldId];
        if (raw == null) continue;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n) || n < f.min || n > f.max) continue;
        (sanitised as Record<string, number>)[f.id] = n;
      }
      const e: MeasurementEntry = {
        ...sanitised,
        id: uid(),
        // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для timestamp запису (не Kyiv-межа доби)
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
