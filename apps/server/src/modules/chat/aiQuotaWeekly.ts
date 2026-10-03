import { weekStartKyiv, type FeatureId } from "@sergeant/shared";
import { withUserContext } from "../../db.js";
import { logger } from "../../obs/logger.js";

/**
 * `endpoint` тег для quota-лічильника (міграції 104/106): PK `ai_usage_daily`
 * тепер 4-колонковий `(subject_key, usage_day, bucket, endpoint)`, і
 * `endpoint` NOT NULL без DEFAULT, тож INSERT без явного значення падає
 * `23502`. Цей модуль рахує КІЛЬКІСТЬ повідомлень (bucket=`week:*`/`tool:*`),
 * а не вартість конкретного кроку (те, що трекає `endpoint` в
 * `anthropicUsageStore.ts`), тож фіксоване значення `'quota'`, а не одне з
 * реальних endpoint-значень (`chat`, `coach-insight`, …), щоб не змішувати
 * дві різні осі групування в одному значенні колонки.
 */
export const AI_QUOTA_ENDPOINT = "quota";

/**
 * Тижневі відра Free. Кожне має власний код 429, бо web відкриває різні
 * пейволи: чат, фото їжі, vision-скан Фініка. Ліміти беруться з реєстру
 * доступу, а не з констант тут.
 */
export type WeeklyMeter = "ai" | "photo" | "finyk-vision";

export const WEEKLY_METERS: Record<
  WeeklyMeter,
  { bucket: string; feature: FeatureId; code: string; error: string }
> = {
  ai: {
    bucket: "week:ai",
    feature: "ai.actions",
    code: "AI_QUOTA",
    error: "Тижневий ліміт Сержанта вичерпано. Оновиться в понеділок.",
  },
  photo: {
    bucket: "week:photo",
    feature: "ai.photo",
    code: "AI_PHOTO_QUOTA",
    error: "Тижневий ліміт фото їжі вичерпано. Оновиться в понеділок.",
  },
  "finyk-vision": {
    bucket: "week:finyk-vision",
    feature: "ai.finykVision",
    code: "AI_FINYK_VISION_QUOTA",
    error:
      "Тижневий ліміт AI-сканів вичерпано. Чек із QR-кодом можна сканувати й далі, решта оновиться в понеділок.",
  },
};

/**
 * Read-only lookup of this week's consumed counts in every Free bucket for a
 * logged-in user. Used by `GET /api/chat/usage` and the access snapshot in
 * `/api/billing/status`. Never mutates. Fail-open to 0 on missing DB /
 * query error: an unreadable counter renders as "0 used" rather than
 * breaking the page.
 */
export async function getWeeklyUsage(
  userId: string,
): Promise<Record<WeeklyMeter, number>> {
  const out: Record<WeeklyMeter, number> = {
    ai: 0,
    photo: 0,
    "finyk-vision": 0,
  };
  if (!process.env["DATABASE_URL"]) return out;
  const meters = Object.keys(WEEKLY_METERS) as WeeklyMeter[];
  try {
    const r = await withUserContext(userId, (db) =>
      db.query<{ bucket: string; request_count: number }>(
        `SELECT bucket, request_count FROM ai_usage_daily
          WHERE subject_key = $1 AND usage_day = $2::date
            AND bucket = ANY($3::text[]) AND endpoint = $4`,
        [
          `u:${userId}`,
          weekStartKyiv(),
          meters.map((m) => WEEKLY_METERS[m].bucket),
          AI_QUOTA_ENDPOINT,
        ],
      ),
    );
    for (const row of r.rows) {
      const meter = meters.find((m) => WEEKLY_METERS[m].bucket === row.bucket);
      if (meter) out[meter] = Number(row.request_count);
    }
  } catch (e) {
    logger.warn({
      msg: "ai_quota_weekly_usage_read_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
  }
  return out;
}
