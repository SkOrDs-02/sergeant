/**
 * Дифф своїх занять для dual-write шару Фізрука.
 *
 * Дзеркало `customExercises.ts`: рядок - JSON-блоб у
 * `fizruk_custom_activities`, тож апсертимо на будь-яку зміну посилання.
 */

import { diffArray } from "./diffArray";

export interface FizrukCustomActivitySnapshot {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface CustomActivityUpsertOp {
  readonly kind: "custom-activity-upsert";
  readonly activity: FizrukCustomActivitySnapshot;
}

export interface CustomActivityDeleteOp {
  readonly kind: "custom-activity-delete";
  readonly activityId: string;
}

export type CustomActivityOp = CustomActivityUpsertOp | CustomActivityDeleteOp;

export function diffCustomActivitiesOps(
  prev: readonly FizrukCustomActivitySnapshot[] | undefined,
  next: readonly FizrukCustomActivitySnapshot[] | undefined,
): CustomActivityOp[] {
  const ops: CustomActivityOp[] = [];
  diffArray(
    prev ?? [],
    next ?? [],
    (a) => a.id,
    () => true, // JSON-блоб: порівнювати поле за полем нема сенсу
    (a) => ops.push({ kind: "custom-activity-upsert", activity: a }),
    (id) => ops.push({ kind: "custom-activity-delete", activityId: id }),
  );
  return ops;
}
