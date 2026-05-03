import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { env } from "../../env/env.js";
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
 * Вузький catch тільки на очікувану ситуацію "файл відсутній" (ENOENT).
 * Пошкоджений JSON і файлові помилки летять наверх в errorHandler.
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

  const dir = path.join(process.cwd(), ".data");
  const key = safeBackupKeyFromToken(userId, req.headers["x-token"], secret);
  const file = path.join(dir, `nutrition-backup-${key}.json`);

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new NotFoundError("Бекап не знайдено");
    }
    throw e;
  }

  const blob = JSON.parse(raw);
  res.status(200).json({ ok: true, blob });
}
