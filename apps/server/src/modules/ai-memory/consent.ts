/**
 * Status: Active.
 * Canonical per-user consent check for server-side AI memory reads and writes.
 */

import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * A missing preferences row keeps the existing product default (`aiMemory=true`).
 * Any persisted value must be explicitly true; malformed/null values fail closed.
 */
export async function hasAiMemoryConsent(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const result = await db.query<{ ai_memory: boolean | null }>(
    `SELECT ai_memory
       FROM user_preferences
      WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return true;
  return result.rows[0]?.ai_memory === true;
}

/**
 * Окрема згода на дані про здоровʼя (GDPR Art. 9 — спеціальна категорія).
 *
 * AI-CONTEXT: гейтить ЛИШЕ персистентний запис у `ai_memories` для
 * payload-ів, помічених `healthData: true`. Рішення founder-а 2026-09-14
 * (продуктовий огляд, знахідка PR-S3): ефемерна відповідь у чаті лишається
 * доступною всім, бо гейт на неї вимкнув би основну цінність AI-шару за
 * замовчуванням — тумблер дефолтиться у `false` і ніхто не вмикає його в
 * онбордингу. А от осідання назавжди — інша річ: вимкнення тумблера
 * постфактум не відкочує вже записані рядки, і саме це було найгострішою
 * точкою знахідки.
 *
 * **Fail-closed, на відміну від `hasAiMemoryConsent` вище.** Там відсутній
 * рядок означає «продуктовий дефолт `aiMemory=true`», бо памʼять увімкнена
 * за замовчуванням. Тут навпаки: колонка `health_data_consent` створена
 * `NOT NULL DEFAULT FALSE` (міграція 111), застосунок теж дефолтить `false`
 * (`dataRights.ts:55`), тож відсутній рядок — це «згоди не давали», і
 * тлумачити його як згоду означало б вигадати її.
 */
export async function hasHealthDataConsent(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const result = await db.query<{ health_data_consent: boolean | null }>(
    `SELECT health_data_consent
       FROM user_preferences
      WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return false;
  return result.rows[0]?.health_data_consent === true;
}
