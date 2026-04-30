import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { NotFoundError } from "../../obs/errors.js";

/**
 * POST /api/nutrition/backup-download — відновити збережений бекап.
 * CORS / token / rate-limit виставляє роутер.
 *
 * Вузький catch тільки на очікувану ситуацію "файл відсутній" (ENOENT).
 * Пошкоджений JSON і файлові помилки летять наверх в errorHandler.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  const key = safeBackupKeyFromToken(req.headers["x-token"]);
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
