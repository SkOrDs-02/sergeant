import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { AnalyzePhotoSchema } from "../../http/schemas.js";
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

КРОК 1 — чи це взагалі їжа. Спершу визнач, чи на фото є їжа або напій.
Тварина, людина, предмет, краєвид, скріншот, порожній кадр — це НЕ їжа.
Етикетка, цінник чи упаковка продукту — це ЇЖА: на них написано, що саме
всередині, тож обробляй їх за КРОКОМ 2а, а не відмовляй.
Якщо їжі немає: "isFood": false, у "dishName" напиши, що насправді на фото
(наприклад "Кіт", "Собака"), у "notFoodKind" — категорію кадру: "animal" для
тварини, "person" для людини, "other" для решти. "macros" — усі null,
"ingredients" і "questions" — порожні масиви. Не вигадуй страву і не питай про
порцію того, чого не їдять.

КРОК 2 — тільки якщо "isFood": true. Оціни страву, інгредієнти, приблизну
порцію та приблизні КБЖВ (ккал, білки/жири/вуглеводи у грамах).
"notFoodKind" тоді null.

КРОК 2б — розбий кадр на позиції в "items". Позиція — це страва, яку людина
назве окремо, а НЕ інгредієнт: "рис з овочами" — ОДНА позиція, не дві;
"борщ" — одна позиція, буряк і капуста йдуть в "ingredients", а не в "items".
Дві страви поруч на тарілці (котлета і пюре) — дві позиції. Максимум 5
позицій; якщо на кадрі більше, обʼєднай найдрібніші. Кожна позиція має власні
"macros" за тими самими правилами, що й КРОК 2, власну "gramsApprox" і власну
"confidence". У "macros" верхнього рівня поклади суму позицій, а в "dishName" —
назву тарілки загалом. Навіть одна страва на кадрі — це одна позиція в
"items", не порожній масив.

Оцінка КБЖВ ОБОВʼЯЗКОВА для будь-якої впізнаваної страви — навіть груба
прикидка з широким запасом краще за порожнє поле, це і є сенс фото-оцінки.
Якщо впевненість низька або порція невідома — постав 1–3 короткі уточнюючі
питання, але питання ДОПОВНЮЮТЬ оцінку, а не замінюють її: дай числа
одночасно з питаннями, не замість них.

КРОК 2а — коли в кадрі етикетка, цінник або упаковка, а не сама страва:
- "dishName" — назва продукту з етикетки;
- вагу з етикетки ("Вага (кг) 0,314", "нетто 250 г", "310 g") переведи в
  ГРАМИ і поклади в "portion.gramsApprox", а в "portion.label" напиши
  "<грами> г з етикетки";
- є таблиця харчової цінності — рахуй по ній: значення там майже завжди на
  100 г, тож помнож кожне на (вага порції / 100);
- таблиці немає — назва страви вже достатня підстава для оцінки: візьми
  типовий склад такої страви і порахуй КБЖВ на задану вагу порції. Перше
  питання — пропозиція сфотографувати таблицю харчової цінності для
  точності, але це ДОДАТКОВЕ уточнення, не причина лишити КБЖВ порожніми.

Нуль і «не знаю» — різні речі, і жодне з двох не типовий випадок для страви
з розпізнаваною назвою. 0 став лише тоді, коли значення справді нульове
(вода, чай без цукру). "null" лишай ТІЛЬКИ коли навіть орієнтовно оцінити
неможливо — сама страва незрозуміла чи нерозбірлива на фото, а не тому, що
бракує точних даних або таблиці харчової цінності. Ніколи не віддавай нулі
замість невідомого: нуль у журналі означає «страва без калорій», а не «не
порахував».

Формат JSON:
{
  "isFood": boolean,
  "notFoodKind": "animal"|"person"|"other"|null,
  "dishName": string,
  "confidence": number, // 0..1
  "portion": { "label": string, "gramsApprox": number|null }|null,
  "ingredients": [{ "name": string, "notes": string|null }],
  "items": [{ "name": string, "macros": { "kcal": number|null, "protein_g": number|null, "fat_g": number|null, "carbs_g": number|null }, "gramsApprox": number|null, "confidence": number }],
  "macros": { "kcal": number|null, "protein_g": number|null, "fat_g": number|null, "carbs_g": number|null },
  "questions": string[]
}
`;

export interface AnalyzePhotoPrompt {
  system: string;
  user: string;
}

/**
 * Промпт цього шляху одним місцем. Зоровий стенд (`pnpm eval:vision`) імпортує
 * саме його: копія тексту в стенді гарантовано розійшлася б із продом — рівно
 * так і зіпсувалася попередня ітерація бенчмарку.
 */
export function buildAnalyzePhotoPrompt(input: {
  locale?: string | undefined;
}): AnalyzePhotoPrompt {
  return {
    system: SYSTEM,
    user: `Мова: ${input.locale || "uk-UA"}.
Спершу скажи, чи на фото їжа. Якщо ні — поверни "isFood": false, напиши, що
там насправді, і постав "notFoodKind". Якщо так — опиши страву, розбий кадр
на позиції в "items" (максимум 5, позиція = страва, не інгредієнт) і порахуй
приблизне КБЖВ для кожної, а за потреби задай уточнення.`,
  };
}

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
  const userId = (req as WithAnthropicKey).user?.id;

  const { image_base64, mime_type, locale } = parseBody(
    AnalyzePhotoSchema,
    req,
  );

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

  const prompt = buildAnalyzePhotoPrompt({ locale });

  const payload = {
    model: visionModel(),
    max_tokens: 1000,
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
    endpoint: "analyze-photo",
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
  const result = normalizePhotoResult(jsonParsed);

  res.status(200).json({ result, rawText: text || null });
}
