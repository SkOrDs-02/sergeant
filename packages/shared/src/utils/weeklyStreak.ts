import { kyivMondayStartMs } from "./date";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_WEEKS_LOOKBACK = 520;

export interface WeeklyStreakOptions {
  readonly targetPerWeek?: number | undefined;
  readonly now?: Date | undefined;
  readonly targetForWeek?: ((weekStartKey: string) => number) | undefined;
}

export interface WeeklyStreakBreakdown {
  readonly weeks: number;
  readonly targetPerWeek: number;
  readonly currentWeekWorkouts: number;
  readonly currentWeekPending: boolean;
  readonly brokenOnWeekStart: string | null;
}

function normalizeTarget(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? 1));
}

export function kyivWeekStartKey(ms: number): string {
  const mondayStart = kyivMondayStartMs(ms);
  return new Date(mondayStart + MS_PER_DAY / 2).toISOString().slice(0, 10);
}

export function computeWeeklyStreakBreakdownFromInstants(
  instants: readonly (Date | number | string)[] | null | undefined,
  options: WeeklyStreakOptions = {},
): WeeklyStreakBreakdown {
  const { targetPerWeek = 1, now = new Date(), targetForWeek } = options;
  const defaultTarget = normalizeTarget(targetPerWeek);
  const list = Array.isArray(instants) ? instants : [];

  const perWeek = new Map<string, number>();
  let earliestMs = Infinity;
  for (const instant of list) {
    const ms = (
      instant instanceof Date ? instant : new Date(instant)
    ).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms < earliestMs) earliestMs = ms;
    const key = kyivWeekStartKey(ms);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }

  const currentWeekStart = kyivMondayStartMs(now.getTime());
  const currentKey = kyivWeekStartKey(currentWeekStart);
  const currentWeekWorkouts = perWeek.get(currentKey) ?? 0;
  const currentTarget = normalizeTarget(
    targetForWeek ? targetForWeek(currentKey) : defaultTarget,
  );

  const empty: WeeklyStreakBreakdown = {
    weeks: 0,
    targetPerWeek: currentTarget,
    currentWeekWorkouts,
    currentWeekPending: false,
    brokenOnWeekStart: null,
  };
  if (perWeek.size === 0) return empty;

  const earliestWeekStart = kyivMondayStartMs(earliestMs);
  const currentMet = currentWeekWorkouts >= currentTarget;

  let weeks = 0;
  let brokenOnWeekStart: string | null = null;
  let cursor = currentMet
    ? currentWeekStart
    : kyivMondayStartMs(currentWeekStart - MS_PER_DAY);

  for (let i = 0; i < MAX_WEEKS_LOOKBACK; i++) {
    if (cursor < earliestWeekStart) break;
    const key = kyivWeekStartKey(cursor);
    const target = normalizeTarget(
      targetForWeek ? targetForWeek(key) : defaultTarget,
    );
    if ((perWeek.get(key) ?? 0) < target) {
      brokenOnWeekStart = key;
      break;
    }
    weeks += 1;
    cursor = kyivMondayStartMs(cursor - MS_PER_DAY);
  }

  return {
    weeks,
    targetPerWeek: currentTarget,
    currentWeekWorkouts,
    currentWeekPending: !currentMet,
    brokenOnWeekStart,
  };
}

export function computeWeeklyStreakWeeksFromInstants(
  instants: readonly (Date | number | string)[] | null | undefined,
  options: WeeklyStreakOptions = {},
): number {
  return computeWeeklyStreakBreakdownFromInstants(instants, options).weeks;
}
