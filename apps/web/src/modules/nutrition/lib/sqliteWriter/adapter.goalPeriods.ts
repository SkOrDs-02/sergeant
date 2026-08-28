import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteRuntime } from "@sergeant/dualwrite-core";
import { resolveOriginDeviceId } from "@sergeant/shared";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { webKVStore } from "@shared/lib/storage/storage";

import { fireSyncOutboxUpsert } from "../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import type { GoalPeriodInsertOp, NutritionGoalSnapshot } from "./diff.js";

/**
 * Хендлер op-kind-у `goal-period-insert` — append-only журнал цілей КБЖВ.
 *
 * W1-KBJU-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `adapter.ts` (646 рядків — уже над лімітом 600, Hard Rule #18), і
 * водночас фізична межа: append-only-запис не має змішуватись із
 * LWW-upsert-ами решти nutrition-таблиць.
 *
 * ПАРАЛЕЛЬНО, А НЕ ЗАМІСТЬ. `prefs-upsert` їде як їхав — `nutrition_prefs`
 * лишається єдиним джерелом цілі для кожного екрана на web і mobile до
 * стадії 3. Якщо цей шлях зламається, користувач нічого не помітить; це і
 * є критерій приймання стадії 1.
 *
 * Що тут важливо і чого свідомо НЕМАЄ:
 *
 *   - **`INSERT OR IGNORE`**, без `ON CONFLICT DO UPDATE` і без
 *     LWW-guard-а. Сходинка незмінна: виправлення — це НОВА сходинка, а
 *     не редагування старої.
 *   - **ДЕТЕРМІНОВАНИЙ `id`.** Це не мікрооптимізація. `crypto.randomUUID()`
 *     дав би на кожному ретраї другу сходинку з тими самими числами того
 *     самого дня — і журнал НАМІРУ перестав би бути журналом наміру.
 *     Складові id (`effective_from` + усі пʼять значень + device) дібрані
 *     так, що ретрай схлопується, а справжня друга зміна за той самий
 *     вечір — ні.
 *   - **жодного запису в `nutrition_prefs`.** Його вже зробив старий
 *     шлях; дублювати означало б два UPDATE на одну дію.
 *
 * `effective_from` = СЬОГОДНІ в Kyiv, а не день пристрою: доменний
 * інваріант (`docs/02-engineering/architecture/domain-invariants.md`).
 * Юзер, що змінює ціль о 23:30 у Лісабоні, має отримати київський день —
 * інакше сходинка ляже на добу раніше, ніж її побачить решта системи.
 *
 * Ретроактивна зміна (`effective_from` у минулому) сюди НЕ входить: це
 * варіант B openQuestion-у, і він не ратифікований. Тут завжди «з
 * сьогодні вперед».
 */
export async function insertGoalPeriod(
  client: SqliteMigrationClient,
  op: GoalPeriodInsertOp,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const effectiveFrom = goalPeriodEnv.kyivDayKey(clientTs);
  const deviceId = goalPeriodEnv.deviceId();
  const tzOffsetMin = goalPeriodEnv.tzOffsetMin();
  const id = buildGoalPeriodId(effectiveFrom, op.goal, deviceId);
  const { kcal, proteinG, fatG, carbsG, waterMl } = op.goal;

  await client.run(GOAL_PERIOD_INSERT_SQL, [
    id,
    userId,
    effectiveFrom,
    kcal,
    proteinG,
    fatG,
    carbsG,
    waterMl,
    "manual",
    tzOffsetMin,
    clientTs,
    clientTs,
  ]);

  fireSyncOutboxUpsert(client, {
    userId,
    table: "nutrition_goal_periods",
    op: "insert",
    clientTs,
    row: {
      id,
      user_id: userId,
      effective_from: effectiveFrom,
      kcal,
      protein_g: proteinG,
      fat_g: fatG,
      carbs_g: carbsG,
      water_ml: waterMl,
      // 'manual' — усе, що приходить із дуал-райту, є прямою дією юзера.
      // 'preset' / 'tdee' зʼявляться, коли ціль почне рахувати калькулятор;
      // 'backfill' ставить ЛИШЕ серверна міграція 087 і ніхто інший.
      origin: "manual",
      tz_offset_min: tzOffsetMin,
      created_at: clientTs,
    },
  });
}

/**
 * `INSERT OR IGNORE` — дзеркало `ON CONFLICT (id) DO NOTHING` у серверному
 * `applyNutritionGoalPeriods`. `deleted_at` у списку колонок немає: новий
 * період завжди живий, а ретракція — окрема адресна операція.
 *
 * `tz_offset_min` (міграція 109, той самий патерн, що
 * `routine_completion_events` / `nutrition_pantry_events`) — опційне поле
 * на сервері; тут завжди пишемо значення пристрою на момент запису.
 */
const GOAL_PERIOD_INSERT_SQL = `INSERT OR IGNORE INTO nutrition_goal_periods
       (id, user_id, effective_from, kcal, protein_g, fat_g, carbs_g,
        water_ml, origin, tz_offset_min, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Детермінований id сходинки.
 *
 * `n` мапить `null` у `-`, а не в порожній рядок: інакше `{kcal: null,
 * protein: 1}` і `{kcal: 1, protein: null}` дали б однаковий хвіст
 * `::1::`, тобто дві РІЗНІ цілі схлопнулись би в одну сходинку.
 */
export function buildGoalPeriodId(
  effectiveFrom: string,
  goal: NutritionGoalSnapshot,
  deviceId: string | null,
): string {
  const n = (v: number | null): string => (v === null ? "-" : String(v));
  const values = [
    n(goal.kcal),
    n(goal.proteinG),
    n(goal.fatG),
    n(goal.carbsG),
    n(goal.waterMl),
  ].join(":");
  return `gp::${effectiveFrom}::${values}::${deviceId ?? "unknown-device"}`;
}

/**
 * Єдина точка, де append-шлях читає ОТОЧЕННЯ (пристрій, календар).
 *
 * Винесено в експортований обʼєкт навмисно: id детермінований, тож тести
 * мають могти зафіксувати день і пристрій, інакше кожен ассерт на id був
 * би flaky (день змінюється опівночі, device-id — на кожній машині CI).
 * Прод-код ходить сюди ж.
 */
export const goalPeriodEnv = {
  /** Київський день ISO-інстанта `clientTs` (`YYYY-MM-DD`). */
  kyivDayKey(clientTs: string): string {
    return getKyivDayKey(new Date(clientTs));
  },
  /**
   * Той самий device-id, що синк ставить у `X-Origin-Device-Id`. Якщо
   * сховище недоступне — сходинка все одно пишеться, просто без атрибуції
   * пристрою.
   */
  deviceId(): string | null {
    try {
      return resolveOriginDeviceId({ store: webKVStore });
    } catch {
      return null;
    }
  },
  /** Зсув таймзони пристрою у хвилинах (схід від UTC — додатний). */
  tzOffsetMin(): number | null {
    try {
      // Той самий сирий факт, що `routine_completion_events.tz_offset_min` —
      // див. коментар у `routine/.../adapter.completionEvents.ts`.
      // (nutrition не входить у files-скоуп `no-restricted-syntax`
      // new-Date()-guard-а в eslint.cross-surface.js — Theme 1 покриває
      // лише finyk/fizruk/routine — тож disable-коментар тут не потрібен.)
      return -new Date().getTimezoneOffset();
    } catch {
      return null;
    }
  },
};
