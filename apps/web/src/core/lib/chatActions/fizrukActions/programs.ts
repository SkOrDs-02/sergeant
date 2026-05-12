import { ls, lsSet } from "../../hubChatUtils";
import type { AddProgramDayAction, ChatActionResult } from "../types";

export function addProgramDay(action: AddProgramDayAction): ChatActionResult {
  const { weekday, name, exercises } = action.input;
  const wd = Number(weekday);
  if (!Number.isInteger(wd) || wd < 0 || wd > 6)
    return "weekday має бути цілим 0..6.";
  const dayName = (name || "").trim();
  if (!dayName) return "Потрібна назва тренування.";
  const exList: Array<{
    name: string;
    sets?: number;
    reps?: number;
    weight?: number;
  }> = [];
  if (Array.isArray(exercises)) {
    for (const ex of exercises) {
      if (!ex || typeof ex !== "object") continue;
      const exName = String(ex.name || "").trim();
      if (!exName) continue;
      const setsN = Number(ex.sets);
      const repsN = Number(ex.reps);
      const weightN = Number(ex.weight);
      exList.push({
        name: exName,
        sets: Number.isFinite(setsN) && setsN > 0 ? setsN : undefined,
        reps: Number.isFinite(repsN) && repsN > 0 ? repsN : undefined,
        weight: Number.isFinite(weightN) && weightN >= 0 ? weightN : undefined,
      });
    }
  }
  const tpl = ls<{
    schemaVersion?: number;
    days?: Record<string, { name: string; exercises: unknown[] }>;
  }>("fizruk_plan_template_v1", {});
  const days = { ...(tpl.days || {}) };
  days[String(wd)] = { name: dayName, exercises: exList };
  lsSet("fizruk_plan_template_v1", { schemaVersion: 1, days });
  const weekdayLabels = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
  return `День "${dayName}" (${weekdayLabels[wd]}) збережено: ${exList.length} вправ.`;
}
