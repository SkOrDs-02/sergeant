/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Аудит 2026-10-01, data-35: відновлення сходинок журналу цілей КБЖВ з файлу
 * резервної копії.
 *
 * Окремо від `goal-period-insert` (`diff.ts`), бо той описує НОВУ сходинку
 * «з сьогодні вперед»: день, id і `created_at` адаптер бере з годинника й
 * пристрою. Відновлення повертає СТАРУ сходинку як є: її `id`, `effective_from`
 * і `created_at` приходять з файлу, інакше історія цілей з бекапу перетворилась
 * б на одну сходинку «сьогодні». Запис ідемпотентний (`INSERT OR IGNORE` за
 * `id`), журнал append-only: наявні сходинки не змінюються й не видаляються.
 *
 * Диспетчеризація, як і в `diff.pantryEvents.ts`, через чергу цього переходу
 * (`next.goalPeriodRestores`), а не через порівняння знімків стану.
 */
import type {
  NutritionDualWriteOp,
  NutritionDualWriteState,
  NutritionGoalSnapshot,
} from "./diff.js";

export interface NutritionGoalPeriodRestoreSnapshot {
  readonly id: string;
  /** Kyiv-локальний day key `YYYY-MM-DD`. */
  readonly effectiveFrom: string;
  readonly goal: NutritionGoalSnapshot;
  readonly origin: "manual" | "preset" | "tdee" | "backfill";
  /** ISO-8601. */
  readonly createdAt: string;
}

export interface GoalPeriodRestoreOp {
  readonly kind: "goal-period-restore";
  readonly period: NutritionGoalPeriodRestoreSnapshot;
}

/** `goal-period-restore` для кожного елемента `next.goalPeriodRestores` понад `prev`. */
export function diffGoalPeriodRestoreOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
  ops: NutritionDualWriteOp[],
): void {
  const prevCount = prev.goalPeriodRestores?.length ?? 0;
  const nextPeriods = next.goalPeriodRestores ?? [];
  if (nextPeriods.length <= prevCount) return;
  for (const period of nextPeriods.slice(prevCount)) {
    ops.push({ kind: "goal-period-restore", period });
  }
}
