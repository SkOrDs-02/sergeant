/**
 * Fizruk-доменні chat-action payload-и + Workout/WorkoutItem/WorkoutSet.
 * Виокремлено з `types.ts` (initiative 0001 Phase 2). Імпортуються
 * через barrel `./types` без зміни шляхів у consumer-ах.
 */

// ─── Action payload-и ──────────────────────────────────────────────────────

export interface PlanWorkoutAction {
  name: "plan_workout";
  input: {
    date?: string;
    time?: string;
    note?: string;
    exercises?: Array<{
      name: string;
      sets?: number | string;
      reps?: number | string;
      weight?: number | string;
    }>;
  };
}

export interface LogSetAction {
  name: "log_set";
  input: {
    exercise_name: string;
    weight_kg?: number | string;
    reps: number | string;
    sets?: number | string;
  };
}

export interface StartWorkoutAction {
  name: "start_workout";
  input: { note?: string; date?: string; time?: string };
}

export interface FinishWorkoutAction {
  name: "finish_workout";
  input: { workout_id?: string };
}

export interface LogMeasurementAction {
  name: "log_measurement";
  input: Record<string, number | string | undefined>;
}

export interface AddProgramDayAction {
  name: "add_program_day";
  input: {
    weekday: number | string;
    name: string;
    exercises?: Array<{
      name: string;
      sets?: number | string;
      reps?: number | string;
      weight?: number | string;
    }>;
  };
}

export interface LogWellbeingAction {
  name: "log_wellbeing";
  input: {
    weight_kg?: number | string;
    sleep_hours?: number | string;
    energy_level?: number | string;
    mood_score?: number | string;
    note?: string;
  };
}

export interface LogWeightAction {
  name: "log_weight";
  input: { weight_kg: number | string; note?: string };
}

export interface SuggestWorkoutAction {
  name: "suggest_workout";
  input: { focus?: string };
}

export interface CopyWorkoutAction {
  name: "copy_workout";
  input: { source_workout_id?: string; date?: string };
}

export interface CompareProgressAction {
  name: "compare_progress";
  input: {
    exercise_name?: string;
    muscle_group?: string;
    period_days?: number | string;
  };
}

export interface Calculate1rmAction {
  name: "calculate_1rm";
  input: {
    weight_kg: number | string;
    reps: number | string;
    exercise_name?: string;
  };
}

// ─── Domain entities (зберігаються в localStorage / cloudSync) ──────────────

export interface WorkoutSet {
  weightKg: number;
  reps: number;
}

export interface WorkoutItem {
  id: string;
  nameUk: string;
  type: "strength";
  musclesPrimary: string[];
  musclesSecondary: string[];
  sets: WorkoutSet[];
  durationSec: number;
  distanceM: number;
}

export interface Workout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: WorkoutItem[];
  groups: unknown[];
  warmup: unknown | null;
  cooldown: unknown | null;
  note: string;
  planned: boolean;
}
