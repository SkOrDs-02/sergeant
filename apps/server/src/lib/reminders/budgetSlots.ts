/**
 * Слоти денної стелі сповіщень у `push_reminder_log`.
 *
 * Винесено з `./sweep.ts`, бо слоти тепер займає не лише прохід
 * нагадувань, а й push Фініка (ліміт 80 % / 100 %, «завтра спишеться»;
 * спека `docs/work/specs/finyk-limit-and-recurring-push.md`, відповідь
 * власника 2026-11-19: push Фініка рахується в ту саму стелю
 * `push_daily_cap`). Один набір ключів `push-budget-<день>-<k>` на всіх
 * означає, що стелю не пробити ні перегонами реплік, ні двома різними
 * джерелами сповіщень.
 */

import { budgetSlotKey } from "./budget.js";

/** Мінімум БД, потрібний слотам (`pg.Pool` задовольняє структурно). */
export interface SlotDb {
  query(sql: string, params: unknown[]): Promise<{ rowCount: number | null }>;
}

/**
 * Застовпити один із `cap` слотів бюджету доби. Повертає ключ слота або
 * `null`, якщо всі слоти вже зайняті.
 *
 * Бюджет живе в тому самому журналі й тим самим `ON CONFLICT`, що й дедуп
 * приводів, тож стелю не пробити ні перегонами реплік, ні зміною плану
 * посеред доби (людина додала звичку чи змінила стелю): слотів рівно `cap`.
 */
export async function claimBudgetSlot(
  db: SlotDb,
  userId: string,
  dayKey: string,
  cap: number,
): Promise<string | null> {
  for (let k = 1; k <= cap; k++) {
    const key = budgetSlotKey(dayKey, k);
    const { rowCount } = await db.query(
      `INSERT INTO push_reminder_log (user_id, dedup_key, module, day_key)
            VALUES ($1, $2, 'budget', $3)
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      [userId, key, dayKey],
    );
    if ((rowCount ?? 0) > 0) return key;
  }
  return null;
}

/** Повернути слот, під який не лишилось жодного приводу. */
export async function releaseBudgetSlot(
  db: SlotDb,
  userId: string,
  key: string,
): Promise<void> {
  await db.query(
    `DELETE FROM push_reminder_log WHERE user_id = $1 AND dedup_key = $2`,
    [userId, key],
  );
}
