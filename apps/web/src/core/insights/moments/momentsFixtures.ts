import type { Habit, RoutineState } from "@sergeant/routine-domain";

export const TODAY = "2026-08-20";

/** `YYYY-MM-DD` за `n` днів до `TODAY`. */
export function daysBefore(n: number): string {
  const d = new Date(Date.UTC(2026, 7, 20 - n, 12));
  return d.toISOString().slice(0, 10);
}

/** Дні з `from` до `to` днів до сьогодні включно (`from` ≥ `to`). */
export function daysRange(from: number, to: number): string[] {
  const out: string[] = [];
  for (let n = from; n >= to; n--) out.push(daysBefore(n));
  return out;
}

export function habit(id: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    recurrence: "daily",
    startDate: "2026-01-01",
    ...over,
  };
}

type Slice = Pick<RoutineState, "habits" | "completions" | "skips">;

export function state(
  habits: Habit[],
  completions: Record<string, string[]>,
): Slice {
  return { habits, completions, skips: {} };
}

/** Стан після відмітки `habitId` сьогодні. */
export function checkToday(s: Slice, habitId: string): Slice {
  return {
    ...s,
    completions: {
      ...s.completions,
      [habitId]: [...(s.completions[habitId] ?? []), TODAY],
    },
  };
}
