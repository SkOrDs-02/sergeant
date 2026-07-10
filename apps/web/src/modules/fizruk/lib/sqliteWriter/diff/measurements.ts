/**
 * Measurement diff for the Fizruk dual-write layer (Stage 4 baseline).
 *
 * One row per measurement session in `fizruk_measurements`; the diff
 * always upserts on reference change.
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
