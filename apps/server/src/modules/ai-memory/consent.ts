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
 * AI-CONTEXT: з 2026-09-29 (рішення власника, вузький гейт) ця згода — єдине
 * джерело правди для ВСІХ шляхів «дані про здоровʼя → LLM / ai_memories»:
 * чат (контекст, tools, tool_results — `chat/healthGate.ts`), коуч, тижневий
 * дайджест, фото їжі й КБЖВ-плани (`lib/healthConsent.ts`), а також запис і
 * читання `ai_memories` (`service.ts` + `healthRows.ts`). До цього (рішення
 * 2026-09-14, знахідка PR-S3) гейт стояв лише на персистентному записі для
 * payload-ів `healthData: true`, а ефемерна відповідь у чаті лишалась
 * відкритою — і згода зберігалась без юридичної сили
 * (`2026-08-05-external-critique-surface.md` § 1.4).
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
