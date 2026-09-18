/**
 * Daily-log diff for the Fizruk dual-write layer (Stage 12 /
 * PR #070f-mobile-dualwrite). Per-shape module-folder split from
 * the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * Each row is one weigh-in / sleep / energy / mood entry mirrored
 * into the SQLite `fizruk_daily_log` table. The snapshot is flat
 * (no nested arrays) so every scalar field is part of the equality
 * check. The hook uses `mood` directly (the mobile `DailyLogEntry`
 * does not carry `moodScore`).
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
  prev: readonly FizrukDailyLogSnapshot[] | undefined,
  next: readonly FizrukDailyLogSnapshot[] | undefined,
): DailyLogOp[] {
  const ops: DailyLogOp[] = [];
  diffArray(
    prev ?? [],
    next ?? [],
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
