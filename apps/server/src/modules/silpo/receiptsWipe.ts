/**
 * Last validated: 2026-10-19
 * Status: Active
 *
 * Маркер «чеки стерто» (`silpo_wipe_marker.wiped_at`, міграція 165,
 * аудит 2026-10-01 data-47; до 165 жив на `silpo_connection`, і disconnect
 * його стирав).
 *
 * `POST /api/silpo/wipe` лишає підключення живим, тож без маркера найближчий
 * синк (полер раз на ≤8 год або «Оновити чеки») тягнув би ті самі замовлення
 * назад. Маркер = момент останнього wipe: синк НЕ вставляє замовлення з
 * `purchased_at <= wiped_at`. Покупки після wipe приходять як
 * звичайно.
 *
 * Окремий модуль, бо `receipts.ts` уже далеко за `max-lines` (Hard Rule #18).
 */
import { query as defaultQuery } from "../../db.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * Мілісекунди маркера або `null`, якщо wipe не було. Береться пізніший із
 * `silpo_wipe_marker.wiped_at` і старої колонки `silpo_connection.receipts_wiped_at`:
 * у вікні викочування 165 старий інстанс ще пише лише колонку (`GREATEST`
 * ігнорує NULL). `pg` віддає TIMESTAMPTZ як `Date`; рядок приймаємо для
 * сумісності з моками.
 */
export async function loadReceiptsWipedAtMs(
  userId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<number | null> {
  const { rows } = await queryFn<{
    receipts_wiped_at: Date | string | null;
  }>(
    `SELECT GREATEST(
              (SELECT wiped_at FROM silpo_wipe_marker WHERE user_id = $1),
              (SELECT receipts_wiped_at FROM silpo_connection WHERE user_id = $1)
            ) AS receipts_wiped_at`,
    [userId],
    { op: "silpo_wipe_marker_load" },
  );
  const raw = rows[0]?.receipts_wiped_at;
  if (raw == null) return null;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Лишає лише замовлення, куплені СТРОГО після wipe. `wipedAtMs === null`
 * (wipe не було) повертає вхід без змін.
 */
export function dropReceiptsBeforeWipe<T extends { purchasedAtMs: number }>(
  receipts: T[],
  wipedAtMs: number | null,
): T[] {
  if (wipedAtMs === null) return receipts;
  return receipts.filter((r) => r.purchasedAtMs > wipedAtMs);
}
