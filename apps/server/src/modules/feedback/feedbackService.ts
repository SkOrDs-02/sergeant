import type { Pool } from "pg";
import type { FeedbackCategory } from "@sergeant/shared";

/**
 * In-app фідбек — власний sink для головного багрепорт-каналу закритої бети.
 *
 * Сервіс навмисно тонкий: один INSERT без дедуплікації. Це відрізняє його від
 * `submitWaitlistEntry` (там `ON CONFLICT DO NOTHING` по email), і відмінність
 * свідома — той самий тестер може надіслати десять різних репортів, і кожен
 * має вижити. Ідемпотентність тут була б втратою даних, а не захистом.
 *
 * Таблиця — `feedback_entries` (міграція 093).
 */
export interface FeedbackInsertInput {
  category: FeedbackCategory;
  message: string;
  page?: string | null | undefined;
  viewport?: string | null | undefined;
  user_id?: string | null | undefined;
  user_agent?: string | null | undefined;
  app_env?: string | null | undefined;
}

export interface FeedbackInsertResult {
  /** id щойно створеного рядка. */
  id: number;
}

export async function submitFeedbackEntry(
  pool: Pool,
  input: FeedbackInsertInput,
): Promise<FeedbackInsertResult> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO feedback_entries
       (category, message, page, viewport, user_id, user_agent, app_env)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.category,
      input.message,
      input.page ?? null,
      input.viewport ?? null,
      input.user_id ?? null,
      input.user_agent ?? null,
      input.app_env ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    // INSERT без ON CONFLICT або повертає рядок, або кидає. Порожній
    // результат означав би, що контракт pg зламався — краще впасти голосно,
    // ніж віддати клієнту «надіслано» з фейковим id.
    throw new Error("feedback insert returned no row");
  }

  // Hard Rule #1: BIGSERIAL приїжджає з pg рядком — коерсимо в number саме
  // тут, у серіалізаторі, щоб назовні ніколи не витік string-id.
  return { id: Number(row.id) };
}
