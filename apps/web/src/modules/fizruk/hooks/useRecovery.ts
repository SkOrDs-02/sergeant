import { useMemo, useState } from "react";
import { useExerciseCatalog } from "./useExerciseCatalog";
import { useWorkouts } from "./useWorkouts";
import { useDailyLog } from "./useDailyLog";
import {
  applyInjuryHardBlocks,
  computeRecoveryBy,
  computeWellbeingMultiplier,
} from "@sergeant/fizruk-domain";
import { useActiveInjuries } from "./useInjuries";

export function useRecovery() {
  const { musclesUk } = useExerciseCatalog();
  const { workouts } = useWorkouts();
  const { entries: dailyLogEntries } = useDailyLog();
  const { activeInjuries } = useActiveInjuries();

  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    const wellbeingMult = computeWellbeingMultiplier(dailyLogEntries);
    const recoveryBy = computeRecoveryBy(
      workouts,
      musclesUk,
      nowMs,
      dailyLogEntries,
    );
    const by = applyInjuryHardBlocks(
      recoveryBy,
      activeInjuries.map((injury) => injury.muscleGroup),
    );

    const list = Object.values(by)
      .filter((x) => x.id && x.label && !x.injured)
      .sort(
        (a, b) =>
          (b.daysSince ?? 999) - (a.daysSince ?? 999) || b.load7d - a.load7d,
      );

    const ready = list
      .filter((x) => x.lastAt == null || x.status === "green")
      .slice(0, 4);
    const avoid = list.filter((x) => x.status === "red").slice(0, 4);

    return { by, list, ready, avoid, wellbeingMult };
  }, [workouts, musclesUk, dailyLogEntries, activeInjuries, nowMs]);

  return stats;
}
