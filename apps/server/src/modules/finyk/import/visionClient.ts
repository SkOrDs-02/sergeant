import {
  anthropicMessages,
  extractAnthropicText,
} from "../../../lib/anthropic.js";
import { makeAiProviderError } from "../../../obs/errors.js";
import { kyivDateString } from "../receipts/kyivClock.js";
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

export interface ImportScreenshotVisionResult {
  text: string;
  /** `true` — модель уперлась у `max_tokens` і JSON обірвано на півслові.
   * Головна причина «нуль рядків» на довгому списку транзакцій: обірваний
   * JSON не парситься взагалі, тож без цього прапорця відповідь
   * неможливо відрізнити від «нічого не побачив». */
  truncated: boolean;
}

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
 * Кидає (не повертає error-обʼєкт) на upstream-невдачі — caller-у не треба
 * розрізняти "throw" і "ok:false"; `errorHandler` мапить `ExternalServiceError`
 * у клієнтський 502/503 сам.
 */
export async function callImportScreenshotVision(
  input: ImportScreenshotVisionInput,
): Promise<ImportScreenshotVisionResult> {
  if (env.LLM_RECEIPT_PROVIDER === "stub") {
    return { text: STUB_IMPORT_SCREENSHOT_VISION_TEXT, truncated: false };
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  const payload = {
    model: receiptVisionModel(),
    // 8000, не 2000 (бета-фідбек 2026-08-25 «не може знайти транзакції на
    // скріншоті»). Рядок цієї схеми — це 8 полів, серед них кириличний
    // `description`, який токенізується по 2-3 токени на слово: реально
    // виходить ~90-130 токенів на рядок, тобто 2000 вистачало приблизно на
    // 15. Скрін довгого списку (а на телефоні в екран влазить 20-30
    // операцій) обривався на `max_tokens`, обірваний JSON не парсився
    // ВЗАГАЛІ — і користувач бачив не «розпізнав частину», а «не можу
    // знайти транзакції». Оцінка 8000 бере стелю Zod-схеми не повністю
    // (200 рядків), але з великим запасом над будь-яким реальним скріном.
    max_tokens: 8000,
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
          {
            type: "text",
            // Якір дати — київський «сьогодні» (ADR-0078: серверні флоу —
            // Kyiv), без нього моделі галюцинують рік (див. prompts.ts).
            text: buildImportScreenshotUserPrompt(kyivDateString(new Date())),
          },
        ],
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    // 45s, не 20s: разом із підйомом `max_tokens` до 8000 довга відповідь
    // (20-30 рядків) фізично довше генерується, і старий бюджет обривав би
    // саме ті скріни, заради яких ліміт і піднімали. UI на цей час показує
    // `ScanStatus` зі slow-хінтом, тож очікування видиме, не «зависло».
    timeoutMs: 45_000,
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
  // OpenRouter під `/api/v1/messages` віддає Anthropic-сумісне тіло, тож
  // `stop_reason` читається однаково на обох транспортах.
  const stopReason = (data as { stop_reason?: unknown } | undefined)
    ?.stop_reason;
  return {
    text: extractAnthropicText(data),
    truncated: stopReason === "max_tokens",
  };
}
