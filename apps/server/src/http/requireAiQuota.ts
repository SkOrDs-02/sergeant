import type { RequestHandler } from "express";
import { assertAiQuota, type WeeklyMeter } from "../modules/chat/aiQuota.js";

/**
 * Router-middleware обгортка над `assertAiQuota`. Якщо квоту вичерпано —
 * `assertAiQuota` вже віддасть 429 через `res`; middleware тоді мовчки
 * повертає (чейн перериваэться). Інакше пропускає запит далі. `meter`
 * обирає тижневе відро Free: спільні дії, фото їжі чи vision-скан Фініка.
 */
export function requireAiQuota(meter: WeeklyMeter = "ai"): RequestHandler {
  return async (req, res, next) => {
    try {
      const ok = await assertAiQuota(req, res, meter);
      if (!ok) return; // assertAiQuota вже відправила 429
      next();
    } catch (err) {
      next(err);
    }
  };
}
