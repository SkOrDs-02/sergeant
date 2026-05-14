/**
 * Body-measurement diff for the Fizruk dual-write layer (Stage 4
 * baseline). Per-shape module-folder split from the monolithic
 * `diff.ts` — see `docs/audits/2026-05-13-mobile-reliability-ux-roast.md`
 * § P2.2a.
 *
 * Measurements are free-form key-value rows keyed by `id`; the hook
 * always replaces them wholesale on persist, so the diff emits an
 * upsert for any presence and a delete for any disappearance.
 */

import { diffArray } from "./diffArray";

export interface FizrukMeasurementSnapshot {
  readonly id: string;
  readonly at: string;
  readonly [fieldId: string]: string | number | undefined;
}

export interface MeasurementUpsertOp {
  readonly kind: "measurement-upsert";
  readonly measurement: FizrukMeasurementSnapshot;
}

export interface MeasurementDeleteOp {
  readonly kind: "measurement-delete";
  readonly measurementId: string;
}

export type MeasurementOp = MeasurementUpsertOp | MeasurementDeleteOp;

export function diffMeasurementsOps(
  prev: readonly FizrukMeasurementSnapshot[],
  next: readonly FizrukMeasurementSnapshot[],
): MeasurementOp[] {
  const ops: MeasurementOp[] = [];
  diffArray(
    prev,
    next,
    (m) => m.id,
    () => true,
    (m) => ops.push({ kind: "measurement-upsert", measurement: m }),
    (id) => ops.push({ kind: "measurement-delete", measurementId: id }),
  );
  return ops;
}
