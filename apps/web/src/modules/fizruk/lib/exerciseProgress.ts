import {
  epley1rm,
  type Workout,
  type WorkoutItem,
  type WorkoutSet,
} from "@sergeant/fizruk-domain";
import { dateKeyFromDate } from "@sergeant/fizruk-domain/domain/plan/calendar";

export interface ExerciseProgressPoint {
  value: number;
  dateLabel: string;
}

interface ExerciseHistoryEntry {
  workout: Pick<Workout, "startedAt">;
  item: WorkoutItem;
}

interface WeekBucket {
  maxRm: number;
  vol: number;
  date: Date;
}

export function buildStrengthProgressData(history: ExerciseHistoryEntry[]): {
  rmPoints: ExerciseProgressPoint[];
  volPoints: ExerciseProgressPoint[];
} {
  const byWeek = new Map<string, WeekBucket>();
  for (const { workout, item } of history) {
    if (item?.type !== "strength" || !workout?.startedAt) continue;
    const weekStart = startOfLocalIsoWeek(new Date(workout.startedAt));
    const key = dateKeyFromDate(weekStart);
    const sets: WorkoutSet[] = item.sets ?? [];
    let maxRm = 0;
    let vol = 0;
    for (const s of sets) {
      const rm = epley1rm(s.weightKg, s.reps);
      if (rm > maxRm) maxRm = rm;
      vol += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
    }
    const existing = byWeek.get(key) ?? { maxRm: 0, vol: 0, date: weekStart };
    byWeek.set(key, {
      maxRm: Math.max(existing.maxRm, maxRm),
      vol: existing.vol + vol,
      date: existing.date,
    });
  }

  const sorted = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  const rmPoints = sorted.map(([, v]) => ({
    value: Math.round(v.maxRm),
    dateLabel: formatProgressDate(v.date),
  }));
  const volPoints = sorted.map(([, v]) => ({
    value: Math.round(v.vol),
    dateLabel: formatProgressDate(v.date),
  }));
  return { rmPoints, volPoints };
}

export function startOfLocalIsoWeek(d: Date): Date {
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function formatProgressDate(d: Date): string {
  return d.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
}
