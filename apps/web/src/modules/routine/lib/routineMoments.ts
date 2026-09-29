import type { RoutineState } from "@sergeant/routine-domain";

import {
  DAY_TARGET,
  detectRoutineMoment,
} from "../../../core/insights/moments/moments";
import { applyMoment } from "../../../core/insights/moments/momentsStore";
import { anchoredTodayKey } from "./dayAnchor";

/**
 * Момент відмітки звички (ADR-0096) у сховище сьогоднішніх рядків.
 *
 * Знята відмітка прибирає рядки, яких запис більше не підтверджує: рядок
 * звички і «день закрито», бо день знову не закритий.
 */
export function recordRoutineMoment(
  prev: RoutineState,
  next: RoutineState,
  habitId: string,
  dateKey: string,
): void {
  const todayKey = anchoredTodayKey();
  if (dateKey !== todayKey) return;
  const done = (next.completions[habitId] ?? []).includes(dateKey);
  if (!done) {
    applyMoment(todayKey, "routine", null, [habitId, DAY_TARGET]);
    return;
  }
  const moment = detectRoutineMoment({
    prev,
    next,
    habitId,
    dateKey,
    todayKey,
  });
  if (moment) applyMoment(todayKey, "routine", moment);
}
