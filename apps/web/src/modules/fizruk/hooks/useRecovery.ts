import { useMemo, useState } from "react";
import { useExerciseCatalog } from "./useExerciseCatalog";
import { useWorkouts } from "./useWorkouts";
import { useDailyLog } from "./useDailyLog";
import {
  computeRecoveryBy,
  computeWellbeingMultiplier,
} from "@sergeant/fizruk-domain";
import { useActiveInjuries } from "./useInjuries";

export function useRecovery() {
  const { musclesUk } = useExerciseCatalog();
  const { workouts } = useWorkouts();
  const { entries: dailyLogEntries } = useDailyLog();
  const { activeSites } = useActiveInjuries();

  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    const wellbeingMult = computeWellbeingMultiplier(dailyLogEntries);
    const by = computeRecoveryBy(workouts, musclesUk, nowMs, dailyLogEntries);

    const list = Object.values(by)
      .filter((x) => x.id && x.label)
      .sort(
        (a, b) =>
          (b.daysSince ?? 999) - (a.daysSince ?? 999) || b.load7d - a.load7d,
      );

    // A marked site never reaches a positive suggestion. Filtering here rather
    // than inside `computeRecoveryBy` keeps fatigue and injury as separate
    // layers — ADR-0083: injury lives on top of recovery, not inside it.
    const ready = list
      .filter((x) => x.lastAt == null || x.status === "green")
      .filter((x) => !activeSites.has(x.id as never))
      .slice(0, 4);
    const avoid = list.filter((x) => x.status === "red").slice(0, 4);

    return { by, list, ready, avoid, wellbeingMult, activeSites };
  }, [workouts, musclesUk, dailyLogEntries, activeSites, nowMs]);

  return stats;
}
