/**
 * Injury-mark diff for the Fizruk dual-write layer — the "не можна" model
 * (ADR-0083).
 *
 * Per-row upsert to `fizruk_injuries`. The snapshot is flat, so every scalar
 * is part of the equality check.
 *
 * AI-DANGER: `clearedAt` is the field that decides whether a zone is blocked.
 * If it ever drops out of `injuryChanged`, clearing an injury stops producing
 * an op — the mark keeps blocking exercises locally while the server never
 * hears about it, and a device change silently resurrects it.
 */

import { diffArray } from "./diffArray";

export interface FizrukInjurySnapshot {
  readonly id: string;
  /** Key from the `InjurySiteId` keyspace — atlas muscle or joint / spine. */
  readonly site: string;
  readonly startedAt: string;
  /** `null` = the mark is still active. */
  readonly clearedAt: string | null;
  readonly note: string;
}

export interface InjuryUpsertOp {
  readonly kind: "injury-upsert";
  readonly injury: FizrukInjurySnapshot;
}

export interface InjuryDeleteOp {
  readonly kind: "injury-delete";
  readonly injuryId: string;
}

export type InjuryOp = InjuryUpsertOp | InjuryDeleteOp;

export function diffInjuriesOps(
  prev: readonly FizrukInjurySnapshot[],
  next: readonly FizrukInjurySnapshot[],
): InjuryOp[] {
  const ops: InjuryOp[] = [];
  diffArray(
    prev,
    next,
    (e) => e.id,
    injuryChanged,
    (e) => ops.push({ kind: "injury-upsert", injury: e }),
    (id) => ops.push({ kind: "injury-delete", injuryId: id }),
  );
  return ops;
}

function injuryChanged(
  prev: FizrukInjurySnapshot,
  next: FizrukInjurySnapshot,
): boolean {
  return (
    prev.site !== next.site ||
    prev.startedAt !== next.startedAt ||
    prev.clearedAt !== next.clearedAt ||
    prev.note !== next.note
  );
}
