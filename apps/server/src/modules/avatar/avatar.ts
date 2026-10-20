/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Аватар у Postgres (`user_avatars`, migration 161) - аудит 2026-10-01, ux-14.
 *
 * AI-CONTEXT: чому так. Клієнт слав `data:` URL у `user.image`, а
 * `sanitizeUserImage` його навмисно обнуляє (cookie-chunking, інцидент 504).
 * Рішення власника: байти в Postgres (bytea), без S3/R2/CDN. `user.image`
 * тепер тримає КОРОТКИЙ відносний URL `/api/avatar/<userId>?v=<epoch>`.
 *
 * Модуль не знає про Express: приймає `Queryable` і повертає прості значення,
 * тому його легко тестувати без HTTP. Байти НІКОЛИ не логуються (Hard Rule
 * #21): наружу виходять лише `userId` і довжина.
 */
import type { Pool, PoolClient } from "pg";
import { AVATAR_MAX_BYTES, type AvatarContentType } from "@sergeant/shared";

type Queryable = Pick<Pool | PoolClient, "query">;

export { AVATAR_MAX_BYTES };

/**
 * Визначає тип зображення за magic bytes (а не за заявленим `Content-Type`):
 * клієнтові не вірити, `nosniff` на відповіді лишається другою лінією.
 *
 *   PNG  : 89 50 4E 47 0D 0A 1A 0A
 *   JPEG : FF D8 FF
 *   WebP : "RIFF" <4 байти розміру> "WEBP"
 */
export function detectImageType(buf: Buffer): AvatarContentType | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Короткий URL, який кладеться в `user.image`. `v` - epoch-мс `updated_at`:
 * міняється з кожним аплоадом і ламає immutable-кеш браузера.
 */
export function buildAvatarImageUrl(userId: string, updatedAt: Date): string {
  return `/api/avatar/${encodeURIComponent(userId)}?v=${updatedAt.getTime()}`;
}

export interface StoredAvatar {
  contentType: string;
  data: Buffer;
  updatedAt: Date;
}

interface AvatarRow {
  content_type: string;
  data: Buffer;
  updated_at: Date;
}

/**
 * Upsert аватара + оновлення `user.image`. `user.image` пишемо прямим SQL, а
 * не через Better Auth: URL формуємо ми самі (довіряти клієнтові не треба), а
 * `updateUser` ще й гнав би його крізь `sanitizeUserImage`.
 *
 * Повертає `{ image, updatedAt }` - рівно те, що йде у відповідь PUT.
 */
export async function saveAvatar(
  db: Queryable,
  userId: string,
  contentType: AvatarContentType,
  data: Buffer,
): Promise<{ image: string; updatedAt: Date }> {
  const up = await db.query<{ updated_at: Date }>(
    `INSERT INTO user_avatars (user_id, content_type, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET content_type = EXCLUDED.content_type,
           data = EXCLUDED.data,
           updated_at = NOW()
     RETURNING updated_at`,
    [userId, contentType, data],
  );
  const updatedAt = up.rows[0]!.updated_at;
  const image = buildAvatarImageUrl(userId, updatedAt);
  await db.query(
    `UPDATE "user" SET image = $1, "updatedAt" = NOW() WHERE id = $2`,
    [image, userId],
  );
  return { image, updatedAt };
}

/** Байти аватара або `null`, якщо рядка немає. */
export async function loadAvatar(
  db: Queryable,
  userId: string,
): Promise<StoredAvatar | null> {
  const r = await db.query<AvatarRow>(
    `SELECT content_type, data, updated_at FROM user_avatars WHERE user_id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    contentType: row.content_type,
    data: row.data,
    updatedAt: row.updated_at,
  };
}

/**
 * Прибирає рядок і обнуляє `user.image`. Обнуляємо безумовно (а не лише наш
 * `/api/avatar/…`): людина явно просить прибрати фото, а чужий https-аватар з
 * OAuth (Google) теж має зникнути, інакше «Видалити» нічого б не змінило.
 * Ідемпотентно: без рядка просто лишається `image = NULL`.
 */
export async function removeAvatar(
  db: Queryable,
  userId: string,
): Promise<void> {
  await db.query(`DELETE FROM user_avatars WHERE user_id = $1`, [userId]);
  await db.query(
    `UPDATE "user" SET image = NULL, "updatedAt" = NOW() WHERE id = $1`,
    [userId],
  );
}
