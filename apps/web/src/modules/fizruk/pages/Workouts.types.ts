/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import type {
  OneRmSessionPoint,
  WorkoutFinishSummary,
  WorkoutItem,
} from "@sergeant/fizruk-domain";

export type WorkoutsView = "home" | "catalog" | "log" | "templates";

/**
 * Mirrors `FinishFlashState` in `WorkoutJournalSection` / consumed by
 * `WorkoutFinishSheets`. Owned here so the `useState` setter can be
 * passed across both sheets without re-deriving the shape twice.
 */
export interface FinishFlashState extends WorkoutFinishSummary {
  step: "wellbeing" | "injury" | "summary";
  collapsed: boolean;
  workoutId: string;
  energy: number | null;
  mood: number | null;
  injurySites: string[];
  savedWellbeing?: { energy?: number | null; mood?: number | null } | null;
}

/**
 * The catalog `WorkoutItem` carries the workout `startedAt` when
 * resolved as the most recent occurrence of an exercise. We only attach
 * a single extra field, so widen the canonical domain item rather than
 * lying via `any`.
 */
export type LastExerciseItem = WorkoutItem & {
  _startedAt?: string;
  /**
   * Усі силові сесії цієї вправи поза активним тренуванням — для режиму
   * повернення в підказці наступного підходу (`computeNextSetAging`, аудит
   * `logic-04`): без них одна легка сесія після паузи вимикала б режим.
   */
  _sessions?: OneRmSessionPoint[];
};
