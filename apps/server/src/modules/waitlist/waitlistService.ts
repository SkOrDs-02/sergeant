import type { Pool } from "pg";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WaitlistSource, WaitlistTier } from "@sergeant/shared";
import { waitlistEntries } from "@sergeant/db-schema/pg";

/**
 * Phase 0 monetization rails: простий waitlist для майбутнього Pro-тіру.
 *
 * Сервіс свідомо тонкий — single insert із `ON CONFLICT DO NOTHING` по
 * email. `RETURNING id` виокремлює "новий запис" від "вже був" без
 * додаткового SELECT-а:
 *
 *  - Якщо INSERT успішний → `RETURNING id` повертає новий id → `created=true`.
 *  - Якщо conflict → `ON CONFLICT DO NOTHING` пропускає рядок → `RETURNING`
 *    нічого не повертає → `created=false`.
 *
 * Це гарантує idempotency: користувач може натиснути "Join waitlist" хоч сто
 * разів — у БД лишається рівно один запис, і ми точно знаємо, скільки
 * унікальних email-ів реально цікавляться.
 */
export interface WaitlistInsertInput {
  email: string;
  tier_interest: WaitlistTier;
  source: WaitlistSource;
  locale?: string;
  user_id?: string | null;
  user_agent?: string | null;
}

export interface WaitlistInsertResult {
  /** `true` якщо це новий запис; `false` якщо email уже був у списку. */
  created: boolean;
}

export async function submitWaitlistEntry(
  pool: Pool,
  input: WaitlistInsertInput,
): Promise<WaitlistInsertResult> {
  // `LOWER(email)` нормалізація відбувається ще на рівні Zod-схеми
  // (`.toLowerCase()`), але унікальний індекс у БД додатково побудований
  // на `LOWER(email)` — тож нічого не зламається, навіть якщо хтось
  // обійшов схему й передав mixed-case.
  const result = await pool.query<{ id: string }>(
    `INSERT INTO waitlist_entries
       (email, tier_interest, source, locale, user_id, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (LOWER(email)) DO NOTHING
     RETURNING id`,
    [
      input.email,
      input.tier_interest,
      input.source,
      input.locale ?? null,
      input.user_id ?? null,
      input.user_agent ?? null,
    ],
  );
  return { created: result.rowCount === 1 };
}

/**
 * Internal helper для адмінських звітів — повертає aggregate "скільки
 * email-ів по якому tier-у". Не expose-иться через публічний API; виклик
 * з admin-endpoint-у (Phase 2+) або з консолі.
 */
export interface WaitlistTierCount {
  tier_interest: WaitlistTier;
  total: number;
}

export async function countWaitlistByTier(
  pool: Pool,
): Promise<WaitlistTierCount[]> {
  const result = await pool.query<{
    tier_interest: WaitlistTier;
    total: string;
  }>(
    `SELECT tier_interest, COUNT(*)::TEXT AS total
       FROM waitlist_entries
      GROUP BY tier_interest
      ORDER BY tier_interest`,
  );
  // pg повертає COUNT(*) як bigint → string. AGENTS правило #1: завжди
  // coerce у Number() в серіалізаторі. Тут aggregate ніколи не вийде за
  // межі Number.MAX_SAFE_INTEGER (>2^53 entries — нереалістично).
  return result.rows.map((r) => ({
    tier_interest: r.tier_interest,
    total: Number(r.total),
  }));
}

/**
 * Drizzle-powered version of `countWaitlistByTier`. Produces the same result
 * as the raw-SQL variant above but uses the Drizzle query builder as a
 * smoke-test proving that Drizzle works with the existing pg pool.
 *
 * Once the migration from raw SQL to Drizzle is complete, the raw version
 * above can be removed and this becomes the canonical implementation.
 */
export async function countWaitlistByTierDrizzle(
  drizzleDb: NodePgDatabase,
): Promise<WaitlistTierCount[]> {
  const rows = await drizzleDb
    .select({
      tier_interest: waitlistEntries.tierInterest,
      total: sql<number>`cast(count(*) as integer)`,
    })
    .from(waitlistEntries)
    .groupBy(waitlistEntries.tierInterest)
    .orderBy(waitlistEntries.tierInterest);

  // Rule #1: coerce bigint to number in serializers.
  return rows.map((r) => ({
    tier_interest: r.tier_interest,
    total: Number(r.total),
  }));
}
