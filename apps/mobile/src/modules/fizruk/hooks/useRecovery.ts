/**
 * `useRecovery` — mobile hook for muscle recovery status.
 *
 * Port of `apps/web/src/modules/fizruk/hooks/useRecovery.ts`.
 * Uses mobile-local `useFizrukWorkouts` (instead of web's `useWorkouts`),
 * ported `useExerciseCatalog` and `useDailyLog`.
 * Pure recovery computation lives in `@sergeant/fizruk-domain`.
 */
import { useMemo, useState } from "react";

import {
  computeRecoveryBy,
  computeWellbeingMultiplier,
  type DailyLogEntry,
} from "@sergeant/fizruk-domain";

import { useExerciseCatalog } from "./useExerciseCatalog";
import { useFizrukWorkouts } from "./useFizrukWorkouts";
import { useDailyLog } from "./useDailyLog";
import { toDomainWorkouts } from "../lib/toDomain";

export function useRecovery() {
  const { musclesUk } = useExerciseCatalog();
  const { workouts } = useFizrukWorkouts();
  const { entries: dailyLogEntries } = useDailyLog();

  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    const wellbeingMult = computeWellbeingMultiplier(
      dailyLogEntries as Partial<DailyLogEntry>[],
    );
    const by = computeRecoveryBy(
      toDomainWorkouts(workouts).slice(),
      musclesUk,
      nowMs,
      dailyLogEntries as Partial<DailyLogEntry>[],
    );

    const list = Object.values(by)
      .filter((x) => x.id && x.label)
      .sort(
        (a, b) =>
          (b.daysSince ?? 999) - (a.daysSince ?? 999) || b.load7d - a.load7d,
      );

    const ready = list
      .filter((x) => x.lastAt == null || x.status === "green")
      .slice(0, 4);
    const avoid = list.filter((x) => x.status === "red").slice(0, 4);

    return { by, list, ready, avoid, wellbeingMult };
  }, [workouts, musclesUk, dailyLogEntries, nowMs]);

  return stats;
}
