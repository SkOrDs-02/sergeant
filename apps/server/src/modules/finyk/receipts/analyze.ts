import type { Request, Response } from "express";
import { parseBody } from "../../../http/validate.js";
import {
  ReceiptAnalyzeRequestSchema,
  ReceiptDraftResponseSchema,
} from "../../../http/schemas.js";
import type { ReceiptDraft, ReceiptDraftItem } from "../../../http/schemas.js";
import { validateImageBase64 } from "../../../lib/imageMagic.js";
import { extractJsonFromText } from "../../../http/jsonSafe.js";
import { ExternalServiceError } from "../../../obs/errors.js";
import { env } from "../../../env.js";
import { callReceiptVision } from "./visionClient.js";
import { receiptVisionViaOpenRouter } from "./visionTransport.js";
import { kyivWallClockToUtc } from "./kyivClock.js";

type WithSessionUser = Request & { user?: { id: string } };

const MAX_VISION_ITEMS = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Читає копійкове поле з довільного LLM-JSON — ніколи не довіряє типу. */
function toSafeIntKopiykas(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Нормалізує сирий JSON від vision-LLM (snake_case, `prompts.ts`
 * контракт) у камель-кейс draft (`ReceiptDraftSchema`, `@sergeant/shared`).
 * Жодне поле не приймається без перевірки типу — LLM може повернути
 * що завгодно (сміттєвий текст, урізаний JSON, чужу мову тощо); на
 * будь-яку невідповідність — безпечний дефолт, а не throw. Це дзеркалить
 * `normalizePhotoResult` (nutrition) — draft усе одно проходить через
 * обов'язковий редагований review-екран, тож "найкраща здогадка" тут
 * краща за 500-ку на кожне трохи криве фото.
 */
export function normalizeVisionResult(raw: unknown): ReceiptDraft {
  const obj = isRecord(raw) ? raw : {};
  const store =
    typeof obj["store"] === "string" ? (obj["store"] as string) : "";

  const dateStr =
    typeof obj["date"] === "string" ? (obj["date"] as string) : null;
  const timeStr =
    typeof obj["time"] === "string" ? (obj["time"] as string) : null;
  const dateMatch = dateStr ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr) : null;
  const timeMatch = timeStr ? /^(\d{1,2}):(\d{2})$/.exec(timeStr) : null;

  // LLM дало нечитабельну/відсутню дату — "зараз" краще за падіння всього
  // запиту: review-екран усе одно редагований (спека § Review-екран
  // обов'язковий), користувач виправить дату вручну за потреби.
  const purchasedAt =
    dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]
      ? kyivWallClockToUtc({
          year: Number(dateMatch[1]),
          month: Number(dateMatch[2]),
          day: Number(dateMatch[3]),
          hour: timeMatch?.[1] ? Number(timeMatch[1]) : 12,
          minute: timeMatch?.[2] ? Number(timeMatch[2]) : 0,
          second: 0,
        })
      : new Date();

  const rawItems = Array.isArray(obj["items"])
    ? (obj["items"] as unknown[])
    : [];
  const items: ReceiptDraftItem[] = rawItems
    .slice(0, MAX_VISION_ITEMS)
    .map((it, idx) => {
      const item = isRecord(it) ? it : {};
      const name =
        typeof item["name"] === "string" && item["name"].trim()
          ? item["name"].trim()
          : `Позиція ${idx + 1}`;
      const qty =
        typeof item["qty"] === "number" && Number.isFinite(item["qty"])
          ? (item["qty"] as number)
          : 1;
      return {
        position: idx + 1,
        name,
        qty,
        priceKopiykas: toSafeIntKopiykas(item["price_kopiykas"]),
        sumKopiykas: toSafeIntKopiykas(item["sum_kopiykas"]),
      };
    });

  const confidenceRaw = obj["confidence"];
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : null;

  return {
    source: "vision",
    fiscalNum: null,
    store,
    storeTaxId: null,
    purchasedAt: purchasedAt.toISOString(),
    totalKopiykas: toSafeIntKopiykas(obj["total_kopiykas"]),
    items,
    confidence,
    // Round-trip назад у save.ts (спека § Env: не логувати image_base64,
    // тут теж не кладемо його в rawPayload — лише розпізнаний JSON).
    rawPayload: obj,
  };
}

/**
 * POST /api/finyk/receipts/analyze — vision-fallback чек-скану (фото без
 * QR / ДПС недоступна). Draft у відповідь, БЕЗ запису в БД (спека
 * § Флоу v1) — save відбувається окремим `POST /api/finyk/receipts`.
 *
 * Hard Rule #21: НІКОЛИ не логувати `image_base64` — ні тут, ні в
 * `visionClient.ts`/`lib/anthropic.ts` (той самий контракт, що
 * nutrition analyze-photo).
 */
export default async function analyzeReceiptHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user?.id;

  // Ранній guard — до валідації зображення: якщо жоден транспорт не
  // сконфігурований (ні OpenRouter, ні прямий Anthropic), 503 одразу, а
  // не після витраченого часу на декодування 5MB base64.
  const canUseOpenRouter = receiptVisionViaOpenRouter();
  const canUseAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  if (
    env.LLM_RECEIPT_PROVIDER !== "stub" &&
    !canUseOpenRouter &&
    !canUseAnthropic
  ) {
    throw new ExternalServiceError(
      "AI-розпізнавання чеків тимчасово недоступне. Спробуй пізніше.",
      { status: 503, code: "RECEIPT_VISION_UNAVAILABLE" },
    );
  }

  const { image_base64, mime_type } = parseBody(
    ReceiptAnalyzeRequestSchema,
    req,
  );
  const b64 = image_base64.trim();

  // 5MB cap + magic-byte перевірка — той самий `validateImageBase64`, що
  // nutrition analyze-photo (спека § Vision analyze).
  const validation = validateImageBase64(b64, mime_type);
  if (!validation.ok) {
    const status = validation.code === "TOO_LARGE" ? 413 : 415;
    res.status(status).json({
      code: validation.code,
      detail: validation.detail,
      ...(validation.code === "MAGIC_MISMATCH"
        ? {
            declared_mime: validation.declaredMime,
            detected_mime: validation.detectedMime,
          }
        : {}),
    });
    return;
  }

  const text = await callReceiptVision({
    base64: b64,
    mediaType: validation.mimeType,
    ...(userId ? { userId } : {}),
  });

  const parsed = extractJsonFromText(text);
  const draft = normalizeVisionResult(parsed);

  res.status(200).json(ReceiptDraftResponseSchema.parse({ draft }));
}
