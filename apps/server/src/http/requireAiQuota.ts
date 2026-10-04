import type { RequestHandler } from "express";
import {
  assertAiQuota,
  type AssertAiQuotaOptions,
  type WeeklyMeter,
} from "../modules/chat/aiQuota.js";

/**
 * Router-middleware обгортка над `assertAiQuota`. Якщо квоту вичерпано —
 * `assertAiQuota` вже віддасть 429 через `res`; middleware тоді мовчки
 * повертає (чейн перериваэться). Інакше пропускає запит далі. `meter`
 * обирає тижневе відро Free: спільні дії, фото їжі чи vision-скан Фініка.
 *
 * `options.allowRoundTripTicket` (дефолт false) вмикає погашення round-trip-
 * квитка чату. Передавати true ЛИШЕ з `routes/chat.ts`: квитки видає тільки
 * `/api/chat`, а на інших роутах квиток не має знімати списання (sec-03).
 */
export function requireAiQuota(
  meter: WeeklyMeter = "ai",
  options: AssertAiQuotaOptions = {},
): RequestHandler {
  return async (req, res, next) => {
    try {
      const ok = await assertAiQuota(req, res, meter, options);
      if (!ok) return; // assertAiQuota вже відправила 429
      next();
    } catch (err) {
      next(err);
    }
  };
}
