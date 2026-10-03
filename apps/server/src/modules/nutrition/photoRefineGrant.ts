import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { withBypassContext, withUserContext } from "../../db.js";
import { requireAiQuota } from "../../http/index.js";
import { logger } from "../../obs/logger.js";

/**
 * Гранти на refine-photo (sec-14 аудиту 2026-10-01, ADR-0100,
 * `docs/work/specs/access-tiers.md`).
 *
 * Правило реєстру доступу: refine того самого знімка нічого не списує, бо це
 * продовження тієї самої дії; refine ІНШОГО кадру коштує 1 фото з відра
 * `week:photo`, як analyze. Без цієї різниці refine приймав довільне фото з
 * порожнім `prior_result` і віддавав повний vision-аналіз безкоштовно.
 *
 * Механіка без зміни API-контракту: клієнт у refine шле той самий
 * `image_base64`, що й в analyze. Тож `analyze-photo` після УСПІШНОГО аналізу
 * записує грант (user, SHA-256 кадру), а `refine-photo` не списує квоту, коли
 * для його кадру є грант цього ж користувача не старший за `REFINE_GRANT_TTL_MS`.
 * Решта випадків ідуть у звичайне списання `requireAiQuota("photo")`.
 *
 * AI-DANGER: хеш береться від `image_base64.trim()` і в analyze, і в refine
 * (той самий вираз, що вже стоїть у хендлерах перед валідацією). Розійдеться
 * нормалізація з одного боку, і refine того самого знімка почне списувати квоту.
 */

/** Скільки refine того самого кадру лишається «продовженням» після analyze. */
export const REFINE_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

/** Глобальне підчищення прострочених грантів не частіше, ніж раз на стільки. */
const GLOBAL_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/** Стеля рядків за одне глобальне підчищення, щоб воно не тримало транзакцію. */
const GLOBAL_SWEEP_BATCH = 1000;

let lastGlobalSweepAt = 0;

type WithUser = Request & { user?: { id: string } };

/** SHA-256 кадру, як його бачать обидва хендлери (`image_base64.trim()`). */
export function photoSha256(imageBase64: string): string {
  return createHash("sha256").update(imageBase64.trim()).digest("hex");
}

function warnGrantFailure(msg: string, e: unknown): void {
  // Лише повідомлення помилки: ні base64, ні хеш кадру, ні userId у лог не йдуть.
  logger.warn({
    msg,
    err: { message: (e as Error)?.message || String(e) },
  });
}

/**
 * Записує грант після УСПІШНОГО analyze. Ніколи не кидає: збій запису не
 * повинен ламати відповідь, за яку користувач уже заплатив квотою. Наслідок
 * збою один: наступний refine цього кадру спише квоту (безпечна сторона).
 *
 * Заодно чистить прострочені гранти цього користувача, а глобально (за
 * `created_at`-індексом, пачкою) не частіше, ніж раз на 10 хв у процесі.
 */
export async function recordPhotoRefineGrant(
  userId: string | undefined,
  imageBase64: string,
): Promise<void> {
  if (!userId || !process.env["DATABASE_URL"]) return;
  try {
    const now = Date.now();
    const expiredBefore = new Date(now - REFINE_GRANT_TTL_MS);
    const sweepGlobal = now - lastGlobalSweepAt >= GLOBAL_SWEEP_INTERVAL_MS;
    if (sweepGlobal) lastGlobalSweepAt = now;
    await withUserContext(userId, async (db) => {
      await db.query(
        `INSERT INTO ai_photo_refine_grants (user_id, image_sha256, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, image_sha256)
         DO UPDATE SET created_at = EXCLUDED.created_at`,
        [userId, photoSha256(imageBase64), new Date(now)],
      );
      await db.query(
        `DELETE FROM ai_photo_refine_grants
          WHERE user_id = $1 AND created_at < $2`,
        [userId, expiredBefore],
      );
    });
    if (sweepGlobal) await sweepExpiredGrants(expiredBefore);
  } catch (e: unknown) {
    warnGrantFailure("photo_refine_grant_record_failed", e);
  }
}

/**
 * Глобальне підчищення чужих прострочених грантів. Йде у bypass-контексті, бо
 * зачіпає рядки багатьох користувачів: з `withUserContext` майбутня RLS-політика
 * лишила б йому видимим лише власний рядок.
 */
async function sweepExpiredGrants(expiredBefore: Date): Promise<void> {
  await withBypassContext((db) =>
    db.query(
      `DELETE FROM ai_photo_refine_grants
        WHERE ctid IN (
          SELECT ctid FROM ai_photo_refine_grants
           WHERE created_at < $1 LIMIT $2
        )`,
      [expiredBefore, GLOBAL_SWEEP_BATCH],
    ),
  );
}

/** Чи має користувач свіжий грант на цей кадр. Помилка БД = «гранту немає». */
async function hasFreshGrant(
  userId: string,
  imageBase64: string,
): Promise<boolean> {
  if (!process.env["DATABASE_URL"]) return false;
  try {
    const freshAfter = new Date(Date.now() - REFINE_GRANT_TTL_MS);
    const r = await withUserContext(userId, (db) =>
      db.query(
        `SELECT 1 FROM ai_photo_refine_grants
          WHERE user_id = $1 AND image_sha256 = $2 AND created_at > $3`,
        [userId, photoSha256(imageBase64), freshAfter],
      ),
    );
    return r.rows.length > 0;
  } catch (e: unknown) {
    warnGrantFailure("photo_refine_grant_lookup_failed", e);
    return false;
  }
}

/**
 * Middleware refine-photo: грант на цей кадр -> квоту не списуємо; інакше ті
 * самі правила, що й на analyze (`requireAiQuota("photo")`: списує
 * `week:photo`, при вичерпаному 429 `AI_PHOTO_QUOTA`; Pro, founder і
 * `AI_QUOTA_DISABLED` проходять без списання).
 *
 * Тіло без рядкового `image_base64` квоту не списує: його відхилить
 * `parseBody(RefinePhotoSchema)` у хендлері (400), а платити за 400 нема за що.
 */
export function requireRefineGrantOrQuota(): RequestHandler {
  const quota = requireAiQuota("photo");
  return async (req, res, next) => {
    const body = req.body as { image_base64?: unknown } | undefined;
    const image = body?.image_base64;
    const userId = (req as WithUser).user?.id;
    if (typeof image !== "string") {
      next();
      return;
    }
    if (userId && (await hasFreshGrant(userId, image))) {
      next();
      return;
    }
    return quota(req, res, next);
  };
}

/** Test-only: скинути таймер глобального підчищення між тестами. */
export const __photoRefineGrantTestHooks = {
  resetSweepClock(): void {
    lastGlobalSweepAt = 0;
  },
};
