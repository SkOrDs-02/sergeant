import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { RefinePhotoSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { visionModel, visionViaOpenRouter } from "./visionTransport.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { normalizePhotoResult } from "../../lib/nutritionResponse.js";
import { validateImageBase64 } from "../../lib/imageMagic.js";
import { nutritionPhotoRejectedTotal } from "../../obs/metrics.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

export const SYSTEM = `Ти нутріціолог-помічник. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: користувач дав уточнення (вага порції у грамах та/або відповіді на питання).
Перерахуй приблизні КБЖВ, уточни порцію та інгредієнти. Якщо все ще бракує даних — залиш 1–2 питання.

Попередній результат — чернетка, а не істина. Якщо в ньому КБЖВ нульові або
null, це означає «минулого разу не порахував», і повторювати ті самі нулі не
можна: оціни заново.

Оцінка КБЖВ ОБОВʼЯЗКОВА для будь-якої впізнаваної страви — навіть груба
прикидка з широким запасом краще за порожнє поле. Якщо все ще бракує
даних — постав 1–2 питання, але вони ДОПОВНЮЮТЬ оцінку, а не замінюють її:
дай числа одночасно з питаннями, не замість них.

Якщо в кадрі етикетка, цінник або упаковка, а не сама страва — назву і вагу
бери з етикетки (вагу переведи в грами). Є таблиця харчової цінності — рахуй
по ній, помноживши значення на 100 г на (вага порції / 100). Немає таблиці —
назва страви вже достатня підстава: візьми типовий склад такої страви і
порахуй КБЖВ на задану вагу порції.

Нуль і «не знаю» — різні речі, і жодне з двох не типовий випадок для страви
з розпізнаваною назвою. 0 став лише тоді, коли значення справді нульове
(вода, чай без цукру). "null" лишай ТІЛЬКИ коли навіть орієнтовно оцінити
неможливо — не тому, що бракує точних даних чи таблиці харчової цінності.

Якщо на фото немає їжі (тварина, людина, предмет, порожній кадр) — жодні
уточнення цього не міняють: поверни "isFood": false, у "dishName" напиши, що
насправді на фото, у "notFoodKind" — категорію кадру ("animal" для тварини,
"person" для людини, "other" для решти), "macros" усі null, "ingredients" і
"questions" — порожні. Якщо їжа на фото є, "notFoodKind" — null.

Формат JSON:
{
  "isFood": boolean,
  "notFoodKind": "animal"|"person"|"other"|null,
  "dishName": string,
  "confidence": number, // 0..1
  "portion": { "label": string, "gramsApprox": number|null }|null,
  "ingredients": [{ "name": string, "notes": string|null }],
  "macros": { "kcal": number|null, "protein_g": number|null, "fat_g": number|null, "carbs_g": number|null },
  "questions": string[]
}
`;

export interface RefinePhotoPrompt {
  system: string;
  user: string;
  /** Нормалізована вага порції — той самий `fallbackGrams`, що йде в нормалізатор. */
  grams: number | null;
}

/**
 * Промпт цього шляху одним місцем — джерело і для прода, і для зорового
 * стенду (`pnpm eval:vision`). Нормалізацію `portion_grams`/`qna` тримаємо
 * тут же: інакше стенд подавав би моделі інший текст, ніж прод, щойно вхід
 * виявився б нечисловим або довшим за 8 питань.
 */
export function buildRefinePhotoPrompt(input: {
  prior_result: unknown;
  portion_grams?: unknown;
  qna?: unknown;
  locale?: string | undefined;
}): RefinePhotoPrompt {
  const grams =
    typeof input.portion_grams === "number" ? input.portion_grams : null;
  const qa = Array.isArray(input.qna) ? input.qna.slice(0, 8) : [];
  return {
    system: SYSTEM,
    grams,
    user: `Мова: ${input.locale || "uk-UA"}.
Ось попередній результат (може бути приблизний): ${safeJson(input.prior_result)}

Уточнення користувача:
- Порція (г): ${grams != null ? grams : "—"}
- Q&A: ${safeJson(qa)}

Перерахуй і поверни JSON.`,
  };
}

/**
 * POST /api/nutrition/refine-photo — уточнити результати analyze-photo.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const { image_base64, mime_type, prior_result, portion_grams, qna, locale } =
    parseBody(RefinePhotoSchema, req);

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
  const prompt = buildRefinePhotoPrompt({
    prior_result,
    portion_grams,
    qna,
    locale,
  });
  const grams = prompt.grams;

  const payload = {
    model: visionModel(),
    max_tokens: 650,
    temperature: 0.2,
    system: prompt.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: b64 },
          },
          { type: "text", text: prompt.user },
        ],
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20000,
    endpoint: "refine-photo",
    allowOpenRouter: visionViaOpenRouter(),
    ...(userId ? { userId } : {}),
  });
  if (!response || !response.ok) {
    throw makeAiProviderError({
      rawProviderMessage: (data as AnthropicErrorPayload)?.error?.message,
      status: response?.status,
    });
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
