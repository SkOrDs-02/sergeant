import { ls, lsSet } from "../../hubChatUtils";
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
  const entry: Record<string, number | string> = {
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
  const existing = ls<Array<Record<string, unknown>>>(
    "fizruk_measurements_v1",
    [],
  );
  lsSet("fizruk_measurements_v1", [entry, ...existing]);
  return `Заміри записано: ${changed.join(", ")}`;
}
