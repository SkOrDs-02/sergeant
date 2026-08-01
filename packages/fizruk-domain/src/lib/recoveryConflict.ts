import {
  injuryBlockForExercise,
  type InjuryBlock,
  type InjuryCheckableExercise,
} from "./injuryBlock.js";
import type { InjurySiteId } from "../data/injurySites.js";

interface RecoveryEntry {
  label?: string;
  status: "red" | "yellow" | "green";
  lastAt?: number | null;
}

type RecoveryMap = Record<string, RecoveryEntry>;

interface ConflictRow {
  id: string;
  label: string;
  role: "primary" | "secondary";
  status: "red" | "yellow";
}

interface ExerciseMuscles {
  muscles?: { primary?: string[]; secondary?: string[] };
}

interface WorkoutItemMuscles {
  exerciseId?: string;
  musclesPrimary?: string[];
  musclesSecondary?: string[];
}

/** Empty set reused for the common "no injury marks" path. */
const NO_INJURIES: ReadonlySet<InjurySiteId> = new Set<InjurySiteId>();

/**
 * Compare exercise muscle ids with recovery stats (useRecovery().by).
 * Primary muscles weighted higher in messaging; secondary still flagged if not recovered.
 *
 * `activeInjurySites` folds the "не можна" model in (ADR-0083): an injured
 * exercise is a HARD block, not a fatigue warning. Fatigue is advice — an
 * injury mark is the user telling us something already hurts, and the two must
 * not render as the same severity.
 */
export function recoveryConflictsForExercise(
  ex: (ExerciseMuscles & InjuryCheckableExercise) | null | undefined,
  by: RecoveryMap = {},
  activeInjurySites: ReadonlySet<InjurySiteId> = NO_INJURIES,
) {
  const primary = ex?.muscles?.primary || [];
  const secondary = ex?.muscles?.secondary || [];
  const red: ConflictRow[] = [];
  const yellow: ConflictRow[] = [];
  const push = (id: string, role: "primary" | "secondary") => {
    const m = by[id];
    if (!m) return;
    const row: ConflictRow = {
      id,
      label: m.label || id,
      role,
      status: m.status as "red" | "yellow",
    };
    if (m.status === "red") red.push(row);
    else if (m.status === "yellow") yellow.push(row);
  };
  for (const id of primary) push(id, "primary");
  for (const id of secondary) push(id, "secondary");
  const injury: InjuryBlock = injuryBlockForExercise(ex, activeInjurySites);
  return {
    red,
    yellow,
    injury,
    hasWarning: red.length > 0 || yellow.length > 0 || injury.blocked,
    hasHardBlock: red.length > 0 || injury.blocked,
  };
}

export function recoveryConflictsForWorkoutItem(
  it: WorkoutItemMuscles | null | undefined,
  by: RecoveryMap = {},
  activeInjurySites: ReadonlySet<InjurySiteId> = NO_INJURIES,
) {
  const primary = it?.musclesPrimary || [];
  const secondary = it?.musclesSecondary || [];
  // `exerciseId` must survive the reshape: without it the zone half of the
  // injury check silently degrades to muscle-only for every logged item.
  const ex: ExerciseMuscles & InjuryCheckableExercise = {
    muscles: { primary, secondary },
    ...(it?.exerciseId ? { exerciseId: it.exerciseId } : {}),
  };
  return recoveryConflictsForExercise(ex, by, activeInjurySites);
}
