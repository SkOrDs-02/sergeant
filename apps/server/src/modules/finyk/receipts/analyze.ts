import type { Request, Response } from "express";
import { parseBody } from "../../../http/validate.js";
import {
  ReceiptAnalyzeRequestSchema,
  ReceiptDraftResponseSchema,
} from "../../../http/schemas.js";
import type { ReceiptDraft, ReceiptDraftItem } from "../../../http/schemas.js";
import {
  AMOUNT_MINOR_MAX,
  RECEIPT_ITEM_NAME_MAX_LEN,
  RECEIPT_ITEM_QTY_ABS_MAX,
  RECEIPT_STORE_MAX_LEN,
} from "@sergeant/shared";
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Читає копійкове поле з довільного LLM-JSON — ніколи не довіряє типу, і
 * ЗАВЖДИ кламп-ить у межі, які вимагає shared-схема (Hard Rule #3):
 * `total_kopiykas` — `[0, AMOUNT_MINOR_MAX]`, `price_kopiykas`/
 * `sum_kopiykas` — `[-AMOUNT_MINOR_MAX, AMOUNT_MINOR_MAX]` (рядок знижки
 * легітимно відʼємний, звідси окремі `min`/`max` за викликом, не єдина
 * жорстка межа). Без цього LLM-галюцинація (відʼємний total, число поза
 * AMOUNT_MINOR_MAX) проходила б крізь `Math.round`, і фінальний
 * `ReceiptDraftResponseSchema.parse()` кидав би — 500 замість
 * редагованої чернетки (review-фікс MAJOR). */
function toSafeIntKopiykas(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.round(n), min, max);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * `kyivWallClockToUtc` (і всередині нього `Date.UTC`) НЕ валідує
 * календарні компоненти — неможлива дата (напр. 2026-02-31, 2026-13-05)
 * мовчки "перекочує" в сусідній місяць/рік замість падіння (review-фікс
 * MAJOR). Регекс нижче перевіряє лише ФОРМАТ (`\d{4}-\d{2}-\d{2}`), не
 * календарну коректність — ця перевірка йде ОКРЕМО, ДО виклику
 * `kyivWallClockToUtc`.
 */
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 31);
  return day <= maxDay;
}

/** Той самий мотив, що `isValidCalendarDate` — "99:99" проходить формат
 * `\d{1,2}:\d{2}`, але `Date.UTC` перекотив би зайві години/хвилини в
 * наступну добу мовчки. */
function isValidWallClockTime(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59
  );
}

/**
 * Нормалізує сирий JSON від vision-LLM (snake_case, `prompts.ts`
 * контракт) у камель-кейс draft (`ReceiptDraftSchema`, `@sergeant/shared`).
 * Жодне поле не приймається без перевірки типу — LLM може повернути
 * що завгодно (сміттєвий текст, урізаний JSON, чужу мову тощо); на
 * будь-яку невідповідність — безпечний дефолт, а не throw. Це дзеркалить
 * `normalizePhotoResult` (nutrition) — draft усе одно проходить через
 * обовʼязковий редагований review-екран, тож "найкраща здогадка" тут
 * краща за 500-ку на кожне трохи криве фото.
 *
 * Кожне поле, що потрапляє у `ReceiptDraftResponseSchema.parse()` нижче
 * в handler-і, кламп-иться до МЕЖ ТІЄЇ Ж схеми (store/name — довжина,
 * qty/total/price/sum — числові межі) — інакше LLM-галюцинація (задовге
 * імʼя, відʼємний total, qty поза розумними межами) валила б `.parse()`
 * у 500 замість повернення редагованої чернетки (review-фікс MAJOR).
 */
export function normalizeVisionResult(raw: unknown): ReceiptDraft {
  const obj = isRecord(raw) ? raw : {};
  const storeRaw =
    typeof obj["store"] === "string" ? (obj["store"] as string) : "";
  const store = storeRaw.slice(0, RECEIPT_STORE_MAX_LEN);

  const dateStr =
    typeof obj["date"] === "string" ? (obj["date"] as string) : null;
  const timeStr =
    typeof obj["time"] === "string" ? (obj["time"] as string) : null;
  const dateMatch = dateStr ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr) : null;
  const timeMatch = timeStr ? /^(\d{1,2}):(\d{2})$/.exec(timeStr) : null;

  const dateParts =
    dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]
      ? {
          year: Number(dateMatch[1]),
          month: Number(dateMatch[2]),
          day: Number(dateMatch[3]),
        }
      : null;
  const validDate =
    dateParts &&
    isValidCalendarDate(dateParts.year, dateParts.month, dateParts.day)
      ? dateParts
      : null;

  const timeParts =
    timeMatch && timeMatch[1] && timeMatch[2]
      ? { hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) }
      : null;
  // Невалідний/відсутній час ПРИ ВАЛІДНІЙ даті — дефолт 12:00 (той самий
  // fallback, що й для повністю відсутнього timeStr), а не відкидання
  // всієї дати через криву годину/хвилину.
  const validTime =
    timeParts && isValidWallClockTime(timeParts.hour, timeParts.minute)
      ? timeParts
      : { hour: 12, minute: 0 };

  // LLM дало нечитабельну/неможливу дату — "зараз" краще за падіння
  // всього запиту чи криво "нормалізовану" Date.UTC-дату: review-екран
  // усе одно редагований (спека § Review-екран обовʼязковий), користувач
  // виправить дату вручну за потреби.
  const purchasedAt = validDate
    ? kyivWallClockToUtc({
        year: validDate.year,
        month: validDate.month,
        day: validDate.day,
        hour: validTime.hour,
        minute: validTime.minute,
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
      const nameRaw =
        typeof item["name"] === "string" && item["name"].trim()
          ? item["name"].trim()
          : `Позиція ${idx + 1}`;
      const name = nameRaw.slice(0, RECEIPT_ITEM_NAME_MAX_LEN);
      const qtyRaw =
        typeof item["qty"] === "number" && Number.isFinite(item["qty"])
          ? (item["qty"] as number)
          : 1;
      const qty = clamp(
        qtyRaw,
        -RECEIPT_ITEM_QTY_ABS_MAX,
        RECEIPT_ITEM_QTY_ABS_MAX,
      );
      return {
        position: idx + 1,
        name,
        qty,
        priceKopiykas: toSafeIntKopiykas(
          item["price_kopiykas"],
          -AMOUNT_MINOR_MAX,
          AMOUNT_MINOR_MAX,
        ),
        sumKopiykas: toSafeIntKopiykas(
          item["sum_kopiykas"],
          -AMOUNT_MINOR_MAX,
          AMOUNT_MINOR_MAX,
        ),
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
    totalKopiykas: toSafeIntKopiykas(
      obj["total_kopiykas"],
      0,
      AMOUNT_MINOR_MAX,
    ),
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
