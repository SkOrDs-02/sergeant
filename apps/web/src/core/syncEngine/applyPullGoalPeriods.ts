import type { SyncV2PullOp } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

// Type-only import — стирається при компіляції, тож рантайм-циклу з
// `applyPullOp.ts` (який імпортує хендлер нижче) не виникає.
import type { ApplyPullOutcome } from "./applyPullOp.js";

/**
 * Append-only pull-шлях журналу цілей КБЖВ (W1-KBJU-APPEND, стадія 1).
 *
 * Окремий модуль, а не ще одна функція в `applyPullOp.ts` — і не тільки
 * через розмір (Hard Rule #18), а тому що ГЕНЕРИЧНИЙ шлях цього файлу для
 * цієї таблиці НЕПРАВИЛЬНИЙ, і треба, щоб це було видно.
 *
 * `applyGenericRegistryRow` робить `ON CONFLICT(pk) DO UPDATE SET …`, тобто
 * ПЕРЕЗАПИСУЄ тіло рядка вхідними значеннями. Для LWW-таблиці це те, що
 * треба. Для журналу намірів це стирання історії: період з тим самим `id`
 * (клієнт генерує його детерміновано) отримав би нові числа, і сходинка,
 * яка вже описала минулий тиждень, заднім числом стала б іншою — рівно та
 * поведінка, проти якої існує вся ця таблиця (audit E-1).
 *
 * Тому тут INSERT-IF-ABSENT і нічого більше:
 *
 *   - `op='insert'` з уже відомим `id` → `skipped`, а не помилка: `id`
 *     детермінований, повторна доставка нормальна.
 *   - `op='delete'` → ЛИШЕ tombstone (`deleted_at`), тіло рядка не
 *     чіпаємо. Це ретракція помилкового періоду.
 *   - `op='update'` → `rejected`. Серверний apply-шлях такого не пропускає
 *     (`append_only_violation`), тож сюди воно дійти не може; але якщо
 *     дійде — розбіжність має бути ВИДНОЮ, а не проковтнутою.
 *
 * Стадія 1: у цю таблицю вже пишуть (дуал-райт при зміні `dailyTarget*`),
 * але з неї ще ніхто не читає — цілі на екранах беруться з
 * `nutrition_prefs`. Тобто помилка тут поки не видима користувачу; саме
 * тому її треба зафіксувати ЗАРАЗ, доки вона дешева.
 */
export async function applyNutritionGoalPeriodsPull(
  client: SqliteMigrationClient,
  op: SyncV2PullOp,
  userId: string,
): Promise<ApplyPullOutcome> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id || row["user_id"] !== userId) return "rejected";

  if (op.op === "delete") {
    await client.run(
      `UPDATE nutrition_goal_periods
          SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [op.client_ts, op.client_ts, id, userId],
    );
    return "applied";
  }
  if (op.op !== "insert") return "rejected";

  const effectiveFrom =
    typeof row["effective_from"] === "string" ? row["effective_from"] : null;
  // Без дати сходинка нікуди не приклеїться — резолвер її не побачить
  // ніколи, тож у локальний журнал вона не потрапляє.
  if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return "rejected";
  }

  const existing = await client.all<{ id: string }>(
    `SELECT id FROM nutrition_goal_periods WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  if (existing.length > 0) return "skipped";

  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const origin = typeof row["origin"] === "string" ? row["origin"] : "manual";
  const createdAt =
    typeof row["created_at"] === "string" ? row["created_at"] : op.client_ts;
  const deletedAt =
    typeof row["deleted_at"] === "string" ? row["deleted_at"] : null;

  await client.run(
    `INSERT OR IGNORE INTO nutrition_goal_periods
       (id, user_id, effective_from, kcal, protein_g, fat_g, carbs_g,
        water_ml, origin, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      effectiveFrom,
      // NULL, а не 0: «ціль не задана» і «ціль нуль» — різні речі, і друге
      // пофарбувало б кожен день у провал.
      num(row["kcal"]),
      num(row["protein_g"]),
      num(row["fat_g"]),
      num(row["carbs_g"]),
      num(row["water_ml"]),
      origin,
      createdAt,
      op.client_ts,
      deletedAt,
    ],
  );
  return "applied";
}
