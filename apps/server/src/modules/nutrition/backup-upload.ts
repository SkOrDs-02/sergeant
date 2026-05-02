import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { validateBody } from "../../http/validate.js";
import { BackupUploadSchema } from "../../http/schemas.js";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { AppError } from "../../obs/errors.js";

/**
 * POST /api/nutrition/backup-upload — залити шифрований бекап.
 * CORS / token / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = validateBody(BackupUploadSchema, req, res);
  if (!parsed.ok) return;
  const { blob } = parsed.data;

  // Keep it small-ish; this is encrypted client-side anyway. `z.object`
  // не міряє JSON.stringify-байти, тому розмір перевіряємо тут.
  const raw = JSON.stringify(blob);
  if (raw.length > 2_500_000) {
    throw new AppError("Бекап завеликий", {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  const dir = path.join(process.cwd(), ".data");
  await fs.mkdir(dir, { recursive: true });
  const key = safeBackupKeyFromToken(req.headers["x-token"]);
  const file = path.join(dir, `nutrition-backup-${key}.json`);
  await fs.writeFile(file, raw, "utf8");

  res.status(200).json({ ok: true, savedAt: Date.now() });
}
