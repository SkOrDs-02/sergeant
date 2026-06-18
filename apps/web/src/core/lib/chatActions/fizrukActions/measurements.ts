import { triggerFizrukDualWrite } from "../../../../modules/fizruk/lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMeasurementSnapshots,
  peekFizrukDualWriteState,
} from "../../../../modules/fizruk/lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../../../../modules/fizruk/lib/sqliteReader";
import type { MeasurementEntry } from "@sergeant/fizruk-domain";
import type { LogMeasurementAction, ChatActionResult } from "../types";

export function logMeasurement(action: LogMeasurementAction): ChatActionResult {
  const input = action.input || {};
  const keyMap: Record<string, string> = {
    weight_kg: "weightKg",
    body_fat_pct: "bodyFatPct",
    neck_cm: "neckCm",
    chest_cm: "chestCm",
    waist_cm: "waistCm",
    hips_cm: "hipsCm",
    bicep_l_cm: "bicepLCm",
    bicep_r_cm: "bicepRCm",
    forearm_l_cm: "forearmLCm",
    forearm_r_cm: "forearmRCm",
    thigh_l_cm: "thighLCm",
    thigh_r_cm: "thighRCm",
    calf_l_cm: "calfLCm",
    calf_r_cm: "calfRCm",
  };
  const entry: MeasurementEntry = {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const changed: string[] = [];
  for (const [src, dst] of Object.entries(keyMap)) {
    const v = input[src];
    if (v != null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        entry[dst] = n;
        changed.push(`${dst}=${n}`);
      }
    }
  }
  if (changed.length === 0) return "Немає жодного валідного поля для заміру.";
  // AI-CONTEXT: `fizruk_measurements_v1` is tombstoned (#057f-tombstone) — the
  // module reads from the SQLite warm-cache, not LS. Mirror through the same
  // dual-write pipeline as `useMeasurements` so the entry is visible in the UI
  // and synced cross-device. A raw `lsSet` here would write a key nobody reads.
  const cache = getCachedFizrukSqliteState();
  const existing = cache.refreshedAt === null ? [] : cache.measurements;
  const next: MeasurementEntry[] = [entry, ...existing];
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  triggerFizrukDualWrite(prevDualWrite, {
    ...prevDualWrite,
    measurements: extractMeasurementSnapshots(next),
  });
  return `Заміри записано: ${changed.join(", ")}`;
}
