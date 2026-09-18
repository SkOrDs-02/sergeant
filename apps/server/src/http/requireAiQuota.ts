import type { RequestHandler } from "express";
import { assertAiQuota } from "../modules/chat/aiQuota.js";

/**
 * Router-middleware обгортка над `assertAiQuota`. Якщо квоту вичерпано —
 * `assertAiQuota` вже віддасть 429 через `res`; middleware тоді мовчки
 * повертає (чейн перериваэться). Інакше пропускає запит далі.
 */
export function requireAiQuota(): RequestHandler {
  return async (req, res, next) => {
    try {
      const ok = await assertAiQuota(req, res);
      if (!ok) return; // assertAiQuota вже відправила 429
      next();
    } catch (err) {
      next(err);
    }
  };
}
