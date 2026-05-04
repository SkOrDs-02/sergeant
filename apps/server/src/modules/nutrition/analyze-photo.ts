import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { AnalyzePhotoSchema } from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { normalizePhotoResult } from "../../lib/nutritionResponse.js";
import { validateImageBase64 } from "../../lib/imageMagic.js";
import { nutritionPhotoRejectedTotal } from "../../obs/metrics.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

const SYSTEM = `Ти нутріціолог-помічник. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: з фото їжі оцінити страву, інгредієнти, приблизну порцію, та приблизні КБЖВ (ккал, білки/жири/вуглеводи у грамах).
Якщо впевненість низька або порція невідома — додай 1–3 короткі уточнюючі питання.

Формат JSON:
{
  "dishName": string,
  "confidence": number, // 0..1
  "portion": { "label": string, "gramsApprox": number|null }|null,
  "ingredients": [{ "name": string, "notes": string|null }],
  "macros": { "kcal": number|null, "protein_g": number|null, "fat_g": number|null, "carbs_g": number|null },
  "questions": string[]
}
`;

/**
 * POST /api/nutrition/analyze-photo — розпізнати страву з фото і повернути
 * оцінені КБЖВ. CORS / token / quota / rate-limit виставляє роутер.
 *
 * Широкий `try/catch` свідомо не використовуємо: всі очікувані помилки
 * (bad input) ловить zod + central errorHandler; непередбачені (таймаут
 * Anthropic, мережа) — теж піднімаємо наверх, щоб Sentry/логи отримали
 * повноцінний контекст, а не замаскований `{ error: e.message }`.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  const parsed = validateBody(AnalyzePhotoSchema, req, res);
  if (!parsed.ok) return;
  const { image_base64, mime_type, locale } = parsed.data;

  const b64 = image_base64.trim();

  // M6 — server-side magic-byte валідація. Клієнтський `mime_type` тут лише
  // hint: канонічний MIME, який ми передамо Anthropic-у, визначається за
  // підписом перших 12 байт буфера. Це закриває polyglot-атаки (SVG під
  // виглядом JPEG), декомпресійну bombу (5 MB cap) і відмовляє неприйнятні
  // формати (GIF, SVG) до hop-у на Anthropic.
  const validation = validateImageBase64(b64, mime_type);
  if (!validation.ok) {
    nutritionPhotoRejectedTotal.inc({
      endpoint: "analyze-photo",
      reason: validation.code,
    });
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
  const mediaType = validation.mimeType;

  const userText = `Мова: ${locale || "uk-UA"}.
Опиши, що на фото і порахуй приблизне КБЖВ. Якщо треба — задай уточнення.`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    temperature: 0.2,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: b64 },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20000,
    endpoint: "analyze-photo",
  });
  if (!response || !response.ok) {
    throw new ExternalServiceError(
      (data as AnthropicErrorPayload)?.error?.message || "AI error",
      {
        status: response?.status,
        code: "ANTHROPIC_ERROR",
      },
    );
  }

  const text = extractAnthropicText(data);

  const jsonParsed = extractJsonFromText(text);
  const result = normalizePhotoResult(jsonParsed);

  res.status(200).json({ result, rawText: text || null });
}
