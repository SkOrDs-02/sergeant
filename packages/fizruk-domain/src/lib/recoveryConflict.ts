interface RecoveryEntry {
  label?: string;
  status: "red" | "yellow" | "green";
  lastAt?: number | null;
  injured?: boolean;
}

type RecoveryMap = Record<string, RecoveryEntry>;

interface ConflictRow {
  id: string;
  label: string;
  role: "primary" | "secondary";
  status: "red" | "yellow";
  injured?: boolean;
}

export interface RecoveryConflicts {
  red: ConflictRow[];
  yellow: ConflictRow[];
  hasWarning: boolean;
  hasHardBlock: boolean;
  /** Optional for backward-compatible test doubles; production always sets it. */
  hasInjuryBlock?: boolean;
}

interface ExerciseMuscles {
  muscles?: { primary?: string[]; secondary?: string[] };
}

interface WorkoutItemMuscles {
  musclesPrimary?: string[];
  musclesSecondary?: string[];
}

/**
 * Compare exercise muscle ids with recovery stats (useRecovery().by).
 * Primary muscles weighted higher in messaging; secondary still flagged if not recovered.
 */
export function recoveryConflictsForExercise(
  ex: ExerciseMuscles | null | undefined,
  by: RecoveryMap = {},
): RecoveryConflicts {
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
      injured: m.injured === true,
    };
    if (m.status === "red") red.push(row);
    else if (m.status === "yellow") yellow.push(row);
  };
  for (const id of primary) push(id, "primary");
  for (const id of secondary) push(id, "secondary");
  return {
    red,
    yellow,
    hasWarning: red.length > 0 || yellow.length > 0,
    hasHardBlock: red.length > 0,
    hasInjuryBlock: red.some((row) => row.injured),
  };
}

export function recoveryConflictsForWorkoutItem(
  it: WorkoutItemMuscles | null | undefined,
  by: RecoveryMap = {},
) {
  const primary = it?.musclesPrimary || [];
  const secondary = it?.musclesSecondary || [];
  const ex: ExerciseMuscles = { muscles: { primary, secondary } };
  return recoveryConflictsForExercise(ex, by);
}
