/**
 * Wellbeing diff for the Fizruk dual-write layer (Stage 12.5 /
 * PR #070f2-mobile-dualwrite). Per-shape module-folder split from
 * the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * Keyed by `dateKey` (`YYYY-MM-DD`); the SQLite primary key is the
 * composite `(user_id, date_key)`. Mood / energy / sleepQuality are
 * 1–5 integers; sleepHours is REAL (form supports half-hour ticks).
 */

import { diffArray } from "./diffArray";

export interface FizrukWellbeingSnapshot {
  readonly dateKey: string;
  readonly mood: number | null;
  readonly energy: number | null;
  readonly sleepQuality: number | null;
  readonly sleepHours: number | null;
  readonly notes: string;
  readonly updatedAt: string;
}

export interface WellbeingUpsertOp {
  readonly kind: "wellbeing-upsert";
  readonly entry: FizrukWellbeingSnapshot;
}

export interface WellbeingDeleteOp {
  readonly kind: "wellbeing-delete";
  readonly dateKey: string;
}

export type WellbeingOp = WellbeingUpsertOp | WellbeingDeleteOp;

/** Diff key wrapper so `diffArray` can key wellbeing rows by
 * `dateKey` while still carrying the full snapshot through to the
 * upsert op. */
interface WellbeingDiffItem {
  readonly id: string;
  readonly snapshot: FizrukWellbeingSnapshot;
}

export function diffWellbeingOps(
  prev: readonly FizrukWellbeingSnapshot[] | undefined,
  next: readonly FizrukWellbeingSnapshot[] | undefined,
): WellbeingOp[] {
  const ops: WellbeingOp[] = [];
  diffArray(
    (prev ?? []).map(toWellbeingDiffItem),
    (next ?? []).map(toWellbeingDiffItem),
    (e) => e.id,
    wellbeingChanged,
    (e) => ops.push({ kind: "wellbeing-upsert", entry: e.snapshot }),
    (id) => ops.push({ kind: "wellbeing-delete", dateKey: id }),
  );
  return ops;
}

function toWellbeingDiffItem(
  snapshot: FizrukWellbeingSnapshot,
): WellbeingDiffItem {
  return { id: snapshot.dateKey, snapshot };
}

function wellbeingChanged(
  prev: WellbeingDiffItem,
  next: WellbeingDiffItem,
): boolean {
  const a = prev.snapshot;
  const b = next.snapshot;
  return (
    a.mood !== b.mood ||
    a.energy !== b.energy ||
    a.sleepQuality !== b.sleepQuality ||
    a.sleepHours !== b.sleepHours ||
    a.notes !== b.notes ||
    a.updatedAt !== b.updatedAt
  );
}
