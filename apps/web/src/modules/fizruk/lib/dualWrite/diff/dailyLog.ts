/**
 * Daily-log diff for the Fizruk dual-write layer (Stage 12 / PR #070f-dualwrite).
 *
 * Per-row upsert to `fizruk_daily_log`. The snapshot is flat (no nested
 * arrays) so every scalar field is part of the equality check.
 */

import { diffArray } from "./diffArray";

export interface FizrukDailyLogSnapshot {
  readonly id: string;
  readonly at: string;
  readonly weightKg: number | null;
  readonly sleepHours: number | null;
  readonly energyLevel: number | null;
  readonly mood: number | null;
  readonly note: string;
}

export interface DailyLogUpsertOp {
  readonly kind: "daily-log-upsert";
  readonly entry: FizrukDailyLogSnapshot;
}

export interface DailyLogDeleteOp {
  readonly kind: "daily-log-delete";
  readonly entryId: string;
}

export type DailyLogOp = DailyLogUpsertOp | DailyLogDeleteOp;

export function diffDailyLogOps(
  prev: readonly FizrukDailyLogSnapshot[],
  next: readonly FizrukDailyLogSnapshot[],
): DailyLogOp[] {
  const ops: DailyLogOp[] = [];
  diffArray(
    prev,
    next,
    (e) => e.id,
    dailyLogChanged,
    (e) => ops.push({ kind: "daily-log-upsert", entry: e }),
    (id) => ops.push({ kind: "daily-log-delete", entryId: id }),
  );
  return ops;
}

function dailyLogChanged(
  prev: FizrukDailyLogSnapshot,
  next: FizrukDailyLogSnapshot,
): boolean {
  return (
    prev.at !== next.at ||
    prev.weightKg !== next.weightKg ||
    prev.sleepHours !== next.sleepHours ||
    prev.energyLevel !== next.energyLevel ||
    prev.mood !== next.mood ||
    prev.note !== next.note
  );
}
