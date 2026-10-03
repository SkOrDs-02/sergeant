import type { Request, Response } from "express";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { env } from "../../env/env.js";
import { query } from "../../db.js";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
} from "../../obs/errors.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * POST /api/nutrition/backup-download — відновити збережений бекап.
 * CORS / token / rate-limit / `requireSession()` виставляє роутер.
 *
 * Storage key bind-иться до Better Auth `req.user.id` через
 * `safeBackupKeyFromToken`, тому юзер фізично не може прочитати чужий
 * бекап навіть якщо знає чужий `x-token`.
 *
 * Storage: `nutrition_backups` (міграція 114) — замінило пряме читання з
 * `process.cwd()/.data/` (ефемерна ФС контейнера, pre-beta schema-debt
 * аудит 2026-08-04).
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    throw new UnauthorizedError("Потрібна автентифікація");
  }

  const secret = env.NUTRITION_BACKUP_KEY_SECRET;
  if (!secret) {
    throw new AppError("Бекапи nutrition тимчасово недоступні", {
      status: 503,
      code: "BACKUP_DISABLED",
    });
  }

  const key = safeBackupKeyFromToken(userId, req.headers["x-token"], secret);

  const { rows } = await query<{ payload: unknown }>(
    `SELECT payload FROM nutrition_backups WHERE user_id = $1 AND key = $2`,
    [userId, key],
    { op: "nutrition_backup_select" },
  );

  if (rows.length === 0) {
    throw new NotFoundError("Бекап не знайдено");
  }

  // `payload` — JSONB; `pg` уже парсить його у JS-значення, `JSON.parse`
  // не потрібен (на відміну від старого файлового шляху, де читали raw text).
  res.status(200).json({ ok: true, blob: rows[0]!.payload });
}
