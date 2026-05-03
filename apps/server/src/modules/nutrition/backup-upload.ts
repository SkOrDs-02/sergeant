import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { validateBody } from "../../http/validate.js";
import { BackupUploadSchema } from "../../http/schemas.js";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { env } from "../../env/env.js";
import { AppError, UnauthorizedError } from "../../obs/errors.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * POST /api/nutrition/backup-upload — залити шифрований бекап.
 * CORS / token / rate-limit / `requireSession()` виставляє роутер.
 *
 * Storage key bind-иться до Better Auth `req.user.id` через
 * `safeBackupKeyFromToken`, тому навіть якщо leaked `x-token` потрапив
 * до іншого юзера, він фізично не дотягнеться до чужого файлу: різні
 * `userId` дають різний HMAC і різний шлях на диску.
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
  const key = safeBackupKeyFromToken(userId, req.headers["x-token"], secret);
  const file = path.join(dir, `nutrition-backup-${key}.json`);
  await fs.writeFile(file, raw, "utf8");

  res.status(200).json({ ok: true, savedAt: Date.now() });
}
