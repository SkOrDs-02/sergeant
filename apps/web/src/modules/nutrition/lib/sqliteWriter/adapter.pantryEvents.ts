import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteRuntime } from "@sergeant/dualwrite-core";

import { fireSyncOutboxUpsert } from "../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import type { PantryEventAppendOp } from "./diff.js";

/**
 * Хендлер op-kind-у `pantry-event-append` — append-only журнал руху комори.
 *
 * W1-PANTRY-APPEND, СТАДІЯ 2. Окремий файл, а не ще одна функція в
 * `adapter.ts` (Hard Rule #18) — той самий подряд, що вже застосований до
 * `adapter.goalPeriods.ts` / `adapter.completionEvents.ts`: append-only-
 * семантика не має змішуватись із LWW-upsert-ами решти nutrition-таблиць.
 *
 * ПАРАЛЕЛЬНО, А НЕ ЗАМІСТЬ. `pantry-upsert` (LWW-шлях `nutrition_pantry_items.qty`)
 * їде як їхав — журнал на цій стадії ще нічим не читається.
 *
 * Що тут важливо і чого свідомо НЕМАЄ:
 *
 *   - **`INSERT OR IGNORE`**, без `ON CONFLICT DO UPDATE`. Подія незмінна.
 *   - **`id` НЕ завжди детермінований.** `event.id` приходить від
 *     викликача (diff-шар): `null` для звичайних дій (consume/replenish/
 *     adjust — повтор НЕ має схлопуватись, дві реальні дії лишаються двома
 *     рядками) → адаптер генерує `crypto.randomUUID()`. Ненульовий —
 *     backfill-чекпойнт `'initial'` із `buildPantryInitialCheckpointId`
 *     (ADR-0077 §5): повтор МАЄ схлопнутись через `INSERT OR IGNORE`.
 *   - жодного запису в `nutrition_pantry_items.qty`. Той шлях лишається
 *     власністю `upsertPantry` (`adapter.ts`) — дублювати означало б два
 *     UPDATE на одну дію.
 */
export async function appendPantryEvent(
  client: SqliteMigrationClient,
  op: PantryEventAppendOp,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const { event } = op;
  const id = event.id ?? crypto.randomUUID();
  const tzOffsetMin = pantryEventEnv.tzOffsetMin();

  await client.run(PANTRY_EVENT_INSERT_SQL, [
    id,
    userId,
    event.pantryId,
    event.itemId,
    event.itemKey,
    event.kind,
    event.deltaQty,
    event.absQty,
    event.unit,
    event.source,
    event.mealId,
    clientTs,
    tzOffsetMin,
    clientTs,
    clientTs,
  ]);

  fireSyncOutboxUpsert(client, {
    userId,
    table: "nutrition_pantry_events",
    op: "insert",
    clientTs,
    row: {
      id,
      user_id: userId,
      pantry_id: event.pantryId,
      item_id: event.itemId,
      item_key: event.itemKey,
      kind: event.kind,
      delta_qty: event.deltaQty,
      abs_qty: event.absQty,
      unit: event.unit,
      source: event.source,
      meal_id: event.mealId,
      occurred_at: clientTs,
      tz_offset_min: tzOffsetMin,
      created_at: clientTs,
    },
  });
}

/**
 * `INSERT OR IGNORE` — дзеркало `ON CONFLICT (id) DO NOTHING` у серверному
 * `applyNutritionPantryEvents`. `deleted_at` не в списку параметрів — нова
 * подія завжди жива, ретракція (`op='delete'`) сюди не заходить.
 *
 * `tz_offset_min` (міграція 109, той самий патерн, що
 * `routine_completion_events` / `nutrition_goal_periods`) — опційне поле
 * на сервері; тут завжди пишемо значення пристрою на момент запису.
 */
const PANTRY_EVENT_INSERT_SQL = `INSERT OR IGNORE INTO nutrition_pantry_events
       (id, user_id, pantry_id, item_id, item_key, kind, delta_qty, abs_qty,
        unit, source, meal_id, occurred_at, tz_offset_min, created_at,
        updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`;

/**
 * Єдина точка, де append-шлях читає ОТОЧЕННЯ (таймзона пристрою).
 *
 * Винесено в експортований обʼєкт навмисно, дзеркалячи
 * `routine/.../adapter.completionEvents.ts` `completionEventEnv` і
 * `./adapter.goalPeriods.ts` `goalPeriodEnv`: tz-offset залежить від
 * машини, де крутиться CI, тож тест підміняє цей метод через `vi.spyOn`.
 * Прод-код ходить сюди ж.
 */
export const pantryEventEnv = {
  /** Зсув таймзони пристрою у хвилинах (схід від UTC — додатний). */
  tzOffsetMin(): number | null {
    try {
      // Потрібен саме зсув таймзони ПРИСТРОЮ, той самий сирий факт, що
      // `routine_completion_events.tz_offset_min` — див. коментар там.
      // (nutrition не входить у files-скоуп `no-restricted-syntax`
      // new-Date()-guard-а в eslint.cross-surface.js — Theme 1 покриває
      // лише finyk/fizruk/routine — тож disable-коментар тут не потрібен.)
      return -new Date().getTimezoneOffset();
    } catch {
      return null;
    }
  },
};
