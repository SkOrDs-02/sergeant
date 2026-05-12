import { safeReadLS } from "@shared/lib/storage/storage";
import type { Workout } from "../types";

export function readWorkouts(): Workout[] {
  const parsed = safeReadLS<unknown>("fizruk_workouts_v1", null);
  if (Array.isArray(parsed)) return parsed as Workout[];
  if (
    parsed &&
    typeof parsed === "object" &&
    "workouts" in parsed &&
    Array.isArray((parsed as { workouts: unknown }).workouts)
  ) {
    return (parsed as { workouts: Workout[] }).workouts;
  }
  return [];
}
