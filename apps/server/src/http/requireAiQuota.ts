import type { RequestHandler, Response } from "express";
import {
  assertAiQuota,
  type WeeklyMeter,
  type WithAiQuotaRefund,
} from "../modules/chat/aiQuota.js";
import type { AssertAiQuotaOptions } from "../modules/chat/aiQuotaBudget.js";

/**
 * Відповідь, за яку квоту не платять: провал апстріму чи сервера (5xx) або
 * відмова у запиті ще до виклику моделі (400 валідація тіла, 413/415 кадр).
 * 422 сюди свідомо не входить: чат віддає його вже після відповіді моделі.
 */
function isRefundableStatus(status: number): boolean {
  return status >= 500 || status === 400 || status === 413 || status === 415;
}

/**
 * Повертає списану квоту, коли хендлер завершився відповіддю з
 * `isRefundableStatus`. Одне місце для всіх AI-роутів, щоб новий хендлер не
 * мусив памʼятати про refund на кожній гілці. Closure ідемпотентний, тож
 * явні виклики в `chat.ts` / `coach.ts` з цим не конфліктують.
 *
 * Обрив зʼєднання клієнтом квоту НЕ повертає: 'finish' на знищеному сокеті не
 * настає. Інакше розрив за мить до кінця генерації давав би безкоштовний виклик.
 */
function refundOnFailedResponse(req: WithAiQuotaRefund, res: Response): void {
  res.once("finish", () => {
    if (!isRefundableStatus(res.statusCode)) return;
    req.aiQuotaRefund?.().catch(() => {
      /* refund best-effort, відповідь уже відправлена */
    });
  });
}

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
      refundOnFailedResponse(req as WithAiQuotaRefund, res);
      next();
    } catch (err) {
      next(err);
    }
  };
}
