import {
  anthropicMessages,
  extractAnthropicText,
} from "../../../lib/anthropic.js";
import { makeAiProviderError } from "../../../obs/errors.js";
import { env } from "../../../env.js";
import {
  receiptVisionModel,
  receiptVisionViaOpenRouter,
} from "../receipts/visionTransport.js";
import {
  IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT,
  buildImportScreenshotUserPrompt,
} from "./prompts.js";

/**
 * Vision-транспорт для `POST /api/finyk/import/screenshot/analyze`.
 *
 * Reuse, НЕ форк, env-пари: task-brief явно вимагає ту саму пару
 * `LLM_RECEIPT_PROVIDER` / `OPENROUTER_RECEIPT_MODEL`, що чек-скан v1
 * (`env/aiRoutingEnv.ts`) — окремого прапорця для скринів банкінгу не
 * заводимо. `receiptVisionModel()` / `receiptVisionViaOpenRouter()`
 * імпортуються напряму з `../receipts/visionTransport.js` (READ-ONLY reuse
 * — Stage 2B не редагує файли Stage 2A, лише читає їхні експорти).
 *
 * Не reuse `callReceiptVision()` саме (той жорстко зашиває
 * `RECEIPT_VISION_SYSTEM_PROMPT` і чекову stub-відповідь) — цей клієнт
 * несе ВЛАСНИЙ системний промпт (`prompts.ts` тут) і ВЛАСНИЙ
 * stub-контракт (doc_type/bank/rows, не store/items), тому дублює
 * структуру виклику `anthropicMessages`, а не імпортує чужу.
 */

/**
 * Детерміністичний канонічний текст для `LLM_RECEIPT_PROVIDER=stub` —
 * тести/dev без жодного AI-ключа. Валідний JSON за форматом
 * `IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT`, щоб `extractJsonFromText` +
 * `normalizeImportScreenshotResult` (screenshotAnalyze.ts) відпрацювали
 * той самий шлях, що й зі справжньою моделлю.
 */
const STUB_IMPORT_SCREENSHOT_VISION_TEXT = JSON.stringify({
  doc_type: "bank_screenshot",
  bank: "monobank",
  rows: [
    {
      date: "2026-01-01",
      time: "12:00",
      amount_kopiykas: 100,
      direction: "expense",
      description: "Тестовий мерчант",
      confidence: 0.5,
    },
  ],
});

export interface ImportScreenshotVisionInput {
  base64: string;
  mediaType: string;
  userId?: string | undefined;
}

/**
 * Викликає vision-LLM для `POST /api/finyk/import/screenshot/analyze`.
 *
 * `stub` не ходить у мережу взагалі (той самий контракт, що
 * `receipts/visionClient.ts#callReceiptVision`). Інакше — `anthropicMessages`
 * (retry/timeout/metrics/cost-ledger, спільний транспорт), з
 * `allowOpenRouter` обчисленим із `LLM_RECEIPT_PROVIDER`/`OPENROUTER_API_KEY`.
 * Кидає (не повертає error-об'єкт) на upstream-невдачі — caller-у не треба
 * розрізняти "throw" і "ok:false"; `errorHandler` мапить `ExternalServiceError`
 * у клієнтський 502/503 сам.
 */
export async function callImportScreenshotVision(
  input: ImportScreenshotVisionInput,
): Promise<string> {
  if (env.LLM_RECEIPT_PROVIDER === "stub") {
    return STUB_IMPORT_SCREENSHOT_VISION_TEXT;
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  const payload = {
    model: receiptVisionModel(),
    // 2000 — трохи вище за чекові 900 (receipts/visionClient.ts): скрін
    // банкінгу несе per-row `time`/`direction`/`confidence` понад чекові
    // `qty`/`price`/`sum`, а реалістичний скрін (5-15 рядків, обмежено
    // видимою висотою екрана) не наближається до Zod-максимуму 200 rows —
    // той ліміт захисний, не очікуваний розмір відповіді.
    max_tokens: 2000,
    temperature: 0.1,
    system: IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.base64,
            },
          },
          { type: "text", text: buildImportScreenshotUserPrompt() },
        ],
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20_000,
    endpoint: "finyk-import-screenshot-analyze",
    allowOpenRouter: receiptVisionViaOpenRouter(),
    ...(input.userId ? { userId: input.userId } : {}),
  });
  if (!response || !response.ok) {
    throw makeAiProviderError({
      rawProviderMessage: (data as { error?: { message?: string } } | undefined)
        ?.error?.message,
      status: response?.status,
    });
  }
  return extractAnthropicText(data);
}
