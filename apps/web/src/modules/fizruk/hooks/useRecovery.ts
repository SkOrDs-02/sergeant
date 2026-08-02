import { useMemo, useState } from "react";
import { useExerciseCatalog } from "./useExerciseCatalog";
import { useWorkouts } from "./useWorkouts";
import { useDailyLog } from "./useDailyLog";
import { useInjuries } from "./useInjuries";
import {
  computeRecoveryBy,
  computeWellbeingSignal,
  type MuscleState,
} from "@sergeant/fizruk-domain";
import { injurySiteLabelUk } from "@sergeant/fizruk-domain/data";

/**
 * Recovery snapshot + the injury overlay on top of it.
 *
 * AI-CONTEXT: `computeRecoveryBy` knows only fatigue and recency — it has no
 * concept of injury and deliberately still doesn't (ADR-0083). The "не можна"
 * model is a separate layer applied HERE, so every surface that reads
 * `useRecovery` gets it at once instead of each call site remembering to pass
 * the marks.
 *
 * AI-DANGER: `ready` is the list the product recommends training. An injured
 * zone must never appear in it, no matter how rested the muscle looks — that
 * is the entire point of the model.
 */
export function useRecovery() {
  const { musclesUk } = useExerciseCatalog();
  const { workouts } = useWorkouts();
  const { entries: dailyLogEntries } = useDailyLog();
  const { activeSites: injurySites } = useInjuries();

  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    // `wellbeingSignal` знає не лише множник, а й ЧОМУ він такий: запис поза
    // вікном свіжості більше не рухає відновлення (E-3), і UI мусить це
    // сказати вголос — «журнал заповнено» і «журнал впливає» тепер різні речі.
    const wellbeingSignal = computeWellbeingSignal(dailyLogEntries, nowMs);
    const wellbeingMult = wellbeingSignal.multiplier;
    const by = computeRecoveryBy(workouts, musclesUk, nowMs, dailyLogEntries);

    const list = Object.values(by)
      .filter((x) => x.id && x.label)
      .sort(
        (a, b) =>
          (b.daysSince ?? 999) - (a.daysSince ?? 999) || b.load7d - a.load7d,
      );

    const ready = list
      .filter((x) => x.lastAt == null || x.status === "green")
      // A rested-but-injured muscle is the exact case the old model got
      // wrong: it looked green and got recommended.
      .filter((x) => !injurySites.has(x.id as never))
      .slice(0, 4);

    // Injured zones lead `avoid`: "не можна" outranks "втомлений". Joint and
    // spine marks have no row in `by` at all (they are not muscles), so they
    // are synthesized here — otherwise a knee mark would be invisible on
    // every recovery surface.
    const injuredRows: MuscleState[] = [...injurySites].map((site) => ({
      id: site,
      label: injurySiteLabelUk(site),
      lastAt: null,
      daysSince: null,
      load7d: 0,
      fatigue: 0,
      status: "red" as const,
    }));
    const injuredIds = new Set(injuredRows.map((r) => r.id));
    const avoid = [
      ...injuredRows,
      ...list.filter((x) => x.status === "red" && !injuredIds.has(x.id)),
    ].slice(0, 4);

    return {
      by,
      list,
      ready,
      avoid,
      wellbeingMult,
      wellbeingSignal,
      injurySites,
    };
  }, [workouts, musclesUk, dailyLogEntries, nowMs, injurySites]);

  return stats;
}
