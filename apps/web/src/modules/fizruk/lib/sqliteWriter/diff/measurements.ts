/**
 * Measurement diff for the Fizruk dual-write layer.
 *
 * One row per measurement session in `fizruk_measurements`. Рядки
 * порівнюються поле за полем (обʼєднання ключів обох знімків, `undefined`
 * = поля немає), тож запис, який чіпає один рядок, дає один upsert.
 *
 * AI-CONTEXT: до 2026-09-16 предикат був `() => true` («Stage 4 baseline»):
 * будь-який новий масив пере-upsert-ив УСІ заміри, бо `useMeasurements`
 * щоразу будує новий список. На N рядків це N op-ів у чергу dual-write і N
 * рядків у sync-outbox за одне зважування (`upsertMeasurement` в
 * `adapter.ts` кладе `enqueueOutboxUpsert` після кожного локального запису
 * зі свіжим `clientTs` в `updated_at`). Небезпечно не число, а
 * `clientTs`: незмінений рядок їхав на сервер із НОВІШИМ штампом і за LWW
 * перекривав правку того самого рядка з іншого пристрою, яку цей іще не
 * встиг стягнути. Знімок — відкритий запис
 * (`[fieldId]: string | number | undefined`), тому перелік полів тут не
 * фіксований, на відміну від `dailyLogChanged` поруч.
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
    measurementChanged,
    (m) => ops.push({ kind: "measurement-upsert", measurement: m }),
    (id) => ops.push({ kind: "measurement-delete", measurementId: id }),
  );
  return ops;
}

function measurementChanged(
  prev: FizrukMeasurementSnapshot,
  next: FizrukMeasurementSnapshot,
): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
}
