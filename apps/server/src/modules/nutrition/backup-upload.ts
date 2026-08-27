import type { Request, Response } from "express";
import { parseBody } from "../../http/validate.js";
import { BackupUploadSchema } from "../../http/schemas.js";
import { safeBackupKeyFromToken } from "../../lib/backupKey.js";
import { env } from "../../env/env.js";
import { query } from "../../db.js";
import { AppError, UnauthorizedError } from "../../obs/errors.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * POST /api/nutrition/backup-upload — залити шифрований бекап.
 * CORS / token / rate-limit / `requireSession()` виставляє роутер.
 *
 * Storage key bind-иться до Better Auth `req.user.id` через
 * `safeBackupKeyFromToken`, тому навіть якщо leaked `x-token` потрапив
 * до іншого юзера, він фізично не дотягнеться до чужого бекапу: різні
 * `userId` дають різний HMAC і різний `key` у таблиці.
 *
 * Storage: `nutrition_backups` (міграція 114), write-through upsert по
 * `(user_id, key)` PK — замінює попередній запис у `process.cwd()/.data/`
 * (ефемерна ФС контейнера; Coolify redeploy/restart стирав кожен бекап,
 * pre-beta schema-debt аудит 2026-08-04). `payload` — JSONB: `blob` уже є
 * JSON-обʼєктом, шифрування — client-side всередині значень.
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

  const { blob } = parseBody(BackupUploadSchema, req);

  // Keep it small-ish; this is encrypted client-side anyway. `z.object`
  // не міряє JSON.stringify-байти, тому розмір перевіряємо тут. Поріг
  // узгоджений з коментарем міграції 114 (JSONB/TOAST комфортно тримає цей
  // розмір).
  const raw = JSON.stringify(blob);
  if (raw.length > 2_500_000) {
    throw new AppError("Бекап завеликий", {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  const key = safeBackupKeyFromToken(userId, req.headers["x-token"], secret);

  await query(
    `INSERT INTO nutrition_backups (user_id, key, payload, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [userId, key, raw],
    { op: "nutrition_backup_upsert" },
  );

  res.status(200).json({ ok: true, savedAt: Date.now() });
}
