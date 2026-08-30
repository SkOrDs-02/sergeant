import type { Request, Response } from "express";
import { parseBody } from "../../../http/validate.js";
import {
  ReceiptLookupRequestSchema,
  ReceiptDraftResponseSchema,
} from "../../../http/schemas.js";
import type { ReceiptDraft } from "../../../http/schemas.js";
import { ExternalServiceError, NotFoundError } from "../../../obs/errors.js";
import { fetchDpsCheckXml } from "./dpsClient.js";
import { parseDpsCheckXml } from "./dpsXml.js";

/**
 * POST /api/finyk/receipts/lookup — QR/ДПС-шлях чек-скану v1: клієнт
 * парсить QR фіскального чека і шле пʼять полів; сервер тягне XML з
 * `chkAll` і повертає draft. БЕЗ запису в БД (спека § Флоу v1) — save
 * відбувається окремим `POST /api/finyk/receipts`.
 *
 * Без `DPS_API_TOKEN` → 503 (vision-шлях від цього не залежить, спека
 * § Env). Чек ще не зʼявився в реєстрі ДПС (лаг появи) → 404 з
 * людським повідомленням, що пропонує обидві опції (зачекати / сфоткати).
 *
 * Hard Rule #21: НІКОЛИ не логувати сирий XML (адреси/ПІБ) — ні тут, ні
 * в `dpsClient.ts`/`dpsXml.ts`.
 */
export default async function lookupReceiptHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { fn, id, date, time, sm } = parseBody(ReceiptLookupRequestSchema, req);

  const result = await fetchDpsCheckXml({ fn, id, date, time, sm });

  if (result.status === "no_token") {
    throw new ExternalServiceError(
      "Пошук чека за QR тимчасово недоступний, спробуй сфотографувати чек.",
      { status: 503, code: "DPS_TOKEN_MISSING" },
    );
  }
  if (result.status === "not_found") {
    throw new NotFoundError(
      "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
      { code: "DPS_RECEIPT_NOT_FOUND" },
    );
  }

  const parsed = parseDpsCheckXml(result.xml);
  if (!parsed) {
    throw new ExternalServiceError(
      "Не вдалося розпізнати відповідь реєстру ДПС, спробуй сфотографувати чек.",
      { status: 502, code: "DPS_PARSE_ERROR" },
    );
  }

  const draft: ReceiptDraft = {
    source: "dps",
    fiscalNum: parsed.fiscalNum ?? fn,
    store: parsed.store,
    storeTaxId: parsed.storeTaxId,
    purchasedAt: parsed.purchasedAt.toISOString(),
    totalKopiykas: parsed.totalKopiykas,
    items: parsed.items,
    confidence: null,
    // Опаковий round-trip до save.ts (спека: raw_payload JSONB несе
    // сирий payload джерела); XML серіалізується в JSON-обгортку перед
    // збереженням — колонка НЕ приймає bare-рядок без обгортки тут.
    rawPayload: { xml: result.xml },
  };

  res.status(200).json(ReceiptDraftResponseSchema.parse({ draft }));
}
