import { query as defaultQuery } from "../../db.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * Автоімпорт чеків Сільпо в комору + позначка «вже в коморі» - спека
 * `docs/work/specs/silpo-pantry-auto-import.md` § «Позначка живе на
 * сервері, з атомарним бронюванням».
 *
 * Три серверні дії: увімкнення/вимкнення тумблера автоімпорту
 * (`setPantryAutoImport`), атомарне бронювання позицій ПЕРЕД записом у
 * комору (`claimPantryItems`) і зняття бронювання (`releasePantryItems`,
 * з опційним `decline` - «Повернути» в тості автоімпорту). Атомарність
 * бронювання дає сам Postgres на рівні рядків (`UPDATE ... RETURNING`) -
 * два одночасні `auto`-запити на ті самі позиції ніколи не заброньують
 * одну й ту саму двічі, окремі блокування не потрібні.
 */

/**
 * `PUT /api/silpo/settings` - вмикає/вимикає автоімпорт. Увімкнення
 * записує `now()` у `pantry_auto_import_since`: автоімпорт бере лише
 * чеки, куплені ПІСЛЯ цього моменту (старі чеки могли бути внесені руками
 * до появи позначки - спека § Рішення дизайну, «Лише нові чеки»).
 * Вимкнення ставить `NULL`, повторне увімкнення - новий момент.
 */
export async function setPantryAutoImport(
  userId: string,
  enabled: boolean,
  queryFn: QueryFn = defaultQuery,
): Promise<{ pantryAutoImportSince: string | null }> {
  const { rows } = await queryFn<{
    pantryAutoImportSince: Date | string | null;
  }>(
    `UPDATE silpo_connection
        SET pantry_auto_import_since = ${enabled ? "NOW()" : "NULL"},
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING pantry_auto_import_since AS "pantryAutoImportSince"`,
    [userId],
    { op: "silpo_pantry_auto_import_setting_update" },
  );
  const since = rows[0]?.pantryAutoImportSince ?? null;
  return {
    pantryAutoImportSince:
      since == null
        ? null
        : since instanceof Date
          ? since.toISOString()
          : since,
  };
}

/**
 * `POST /api/silpo/receipts/:id/pantry-claim` - бронює позиції ПЕРЕД
 * записом у комору. `mode: "auto"` бронює лише позиції, які ще НІХТО не
 * заброньував (`pantry_claimed_at IS NULL`), у чеку без
 * `pantry_auto_declined_at` і не старішому за `pantry_auto_import_since` -
 * так другий пристрій, що прийшов пізніше з тим самим чеком, отримує
 * порожню відповідь. `mode: "manual"` бронює повторно (ручний потік завжди
 * дозволяє «додати ще раз», спека § Рішення дизайну - «Ручний потік теж
 * ставить позначку»).
 *
 * Повертає лише РЕАЛЬНО заброньовані `itemIds` - клієнт пише в комору
 * рівно цю підмножину запиту, не весь запит.
 */
export async function claimPantryItems(
  userId: string,
  receiptId: string,
  itemIds: number[],
  mode: "auto" | "manual",
  queryFn: QueryFn = defaultQuery,
): Promise<number[]> {
  const autoConditions =
    mode === "auto"
      ? ` AND i.pantry_claimed_at IS NULL
          AND r.pantry_auto_declined_at IS NULL
          AND r.purchased_at >= COALESCE(c.pantry_auto_import_since, 'infinity'::timestamptz)`
      : "";
  const { rows } = await queryFn<{ id: unknown }>(
    `UPDATE silpo_receipt_items i
        SET pantry_claimed_at = NOW()
       FROM silpo_receipts r
       LEFT JOIN silpo_connection c ON c.user_id = r.user_id
      WHERE i.user_id = $1 AND i.receipt_id = $2 AND i.id = ANY($3::bigint[])
        AND r.user_id = i.user_id AND r.receipt_id = i.receipt_id
        ${autoConditions}
      RETURNING i.id`,
    [userId, receiptId, itemIds],
    { op: "silpo_pantry_claim_update" },
  );
  return rows.map((r) => Number(r.id));
}

/**
 * `POST /api/silpo/receipts/:id/pantry-release` - знімає бронювання.
 * `decline: true` - «Повернути» в тості автоімпорту: додатково ставить
 * `silpo_receipts.pantry_auto_declined_at`, тож найближчий автоімпорт цей
 * чек більше не чіпає (ручний імпорт лишається доступним).
 * `decline: false` - сервер кинув помилку між `pantry-claim` і записом у
 * комору (спека § «Позначка живе на сервері…», порядок кроків): бронювання
 * знімається без відхилення чека, і позиції лишаються звичайним «ще не
 * в коморі» для ручного повтору.
 */
export async function releasePantryItems(
  userId: string,
  receiptId: string,
  itemIds: number[],
  decline: boolean,
  queryFn: QueryFn = defaultQuery,
): Promise<void> {
  await queryFn(
    `UPDATE silpo_receipt_items
        SET pantry_claimed_at = NULL
      WHERE user_id = $1 AND receipt_id = $2 AND id = ANY($3::bigint[])`,
    [userId, receiptId, itemIds],
    { op: "silpo_pantry_release_update" },
  );
  if (decline) {
    await queryFn(
      `UPDATE silpo_receipts
          SET pantry_auto_declined_at = NOW()
        WHERE user_id = $1 AND receipt_id = $2`,
      [userId, receiptId],
      { op: "silpo_pantry_auto_decline_update" },
    );
  }
}
