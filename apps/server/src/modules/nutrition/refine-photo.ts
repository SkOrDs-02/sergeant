import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { RefinePhotoSchema } from "../../http/schemas.js";
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

Задача: користувач дав уточнення (вага порції у грамах та/або відповіді на питання).
Перерахуй приблизні КБЖВ, уточни порцію та інгредієнти. Якщо все ще бракує даних — залиш 1–2 питання.

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
 * POST /api/nutrition/refine-photo — уточнити результати analyze-photo.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  const parsed = validateBody(RefinePhotoSchema, req, res);
  if (!parsed.ok) return;
  const { image_base64, mime_type, prior_result, portion_grams, qna, locale } =
    parsed.data;

  const b64 = image_base64.trim();

  // M6 — server-side magic-byte валідація (див. коментар в analyze-photo.ts).
  const validation = validateImageBase64(b64, mime_type);
  if (!validation.ok) {
    nutritionPhotoRejectedTotal.inc({
      endpoint: "refine-photo",
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
  const grams = typeof portion_grams === "number" ? portion_grams : null;
  const qa = Array.isArray(qna) ? qna.slice(0, 8) : [];

  const userText = `Мова: ${locale || "uk-UA"}.
Ось попередній результат (може бути приблизний): ${safeJson(prior_result)}

Уточнення користувача:
- Порція (г): ${grams != null ? grams : "—"}
- Q&A: ${safeJson(qa)}

Перерахуй і поверни JSON.`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 650,
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
    endpoint: "refine-photo",
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
  const result = normalizePhotoResult(jsonParsed, { fallbackGrams: grams });

  res.status(200).json({ result, rawText: text || null });
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "null";
  }
}
