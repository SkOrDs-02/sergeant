import { query as defaultQuery } from "../../db.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * «Зазвичай не додаєш» в аркуші чека Сільпо - спека
 * `docs/work/specs/silpo-pantry-confirm.md` § Рішення дизайну, «Навчання».
 *
 * Лічильник на продукт (`silpo_pantry_skip_counts`, міграція 178): кожне
 * ручне зняття галочки +1, додавання продукту в комору скидає лічильник
 * (рядок видаляється). Від {@link PANTRY_SKIP_THRESHOLD} поспіль продукт
 * пропонується без галочки. Ключ продукту рахує клієнт (родова назва, якою
 * аркуш згортає позицію), сервер його лише зберігає.
 */
export const PANTRY_SKIP_THRESHOLD = 3;

/** `GET /api/silpo/pantry-skips` - продукти, які людина зазвичай не додає. */
export async function listSkippedProductKeys(
  userId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<string[]> {
  const { rows } = await queryFn<{ product_key: string }>(
    `SELECT product_key
       FROM silpo_pantry_skip_counts
      WHERE user_id = $1 AND consecutive_skips >= $2
      ORDER BY product_key`,
    [userId, PANTRY_SKIP_THRESHOLD],
    { op: "silpo_pantry_skips_select" },
  );
  return rows.map((r) => r.product_key);
}

/**
 * `POST /api/silpo/pantry-skips` - результат одного «Додати» в аркуші.
 * Ключ, що є і в `skipped`, і в `added` (два рядки того самого продукту в
 * різних чеках), рахується як додавання: людина цей продукт таки взяла.
 */
export async function recordPantrySkips(
  userId: string,
  skipped: readonly string[],
  added: readonly string[],
  queryFn: QueryFn = defaultQuery,
): Promise<void> {
  const addedSet = new Set(added);
  const toSkip = [...new Set(skipped)].filter((k) => !addedSet.has(k));
  if (toSkip.length > 0) {
    await queryFn(
      `INSERT INTO silpo_pantry_skip_counts (user_id, product_key, consecutive_skips, updated_at)
       SELECT $1, k, 1, NOW() FROM unnest($2::text[]) AS k
       ON CONFLICT (user_id, product_key) DO UPDATE
         SET consecutive_skips = silpo_pantry_skip_counts.consecutive_skips + 1,
             updated_at = NOW()`,
      [userId, toSkip],
      { op: "silpo_pantry_skips_increment" },
    );
  }
  if (addedSet.size > 0) {
    await queryFn(
      `DELETE FROM silpo_pantry_skip_counts
        WHERE user_id = $1 AND product_key = ANY($2::text[])`,
      [userId, [...addedSet]],
      { op: "silpo_pantry_skips_reset" },
    );
  }
}
