import {
  anthropicMessages,
  extractAnthropicText,
} from "../../../lib/anthropic.js";
import { makeAiProviderError } from "../../../obs/errors.js";
import { env } from "../../../env.js";
import {
  receiptVisionModel,
  receiptVisionViaOpenRouter,
} from "./visionTransport.js";
import {
  RECEIPT_VISION_SYSTEM_PROMPT,
  buildReceiptVisionUserPrompt,
} from "./prompts.js";

/**
 * Детерміністичний канонічний текст для `LLM_RECEIPT_PROVIDER=stub` —
 * тести/dev без жодного AI-ключа. Валідний JSON за форматом
 * `RECEIPT_VISION_SYSTEM_PROMPT`, щоб `extractJsonFromText` +
 * `normalizeVisionResult` (analyze.ts) відпрацювали той самий шлях, що й
 * зі справжньою моделлю.
 */
const STUB_RECEIPT_VISION_TEXT = JSON.stringify({
  store: "Тестовий магазин",
  date: "2026-01-01",
  time: "12:00",
  total_kopiykas: 100,
  items: [{ name: "Товар", qty: 1, price_kopiykas: 100, sum_kopiykas: 100 }],
  confidence: 0.5,
});

export interface ReceiptVisionInput {
  base64: string;
  mediaType: string;
  userId?: string | undefined;
}

/**
 * Викликає vision-LLM для `POST /api/finyk/receipts/analyze`.
 *
 * `stub` не ходить у мережу взагалі. Інакше — `anthropicMessages` (той
 * самий транспорт, retry/timeout/metrics/cost-ledger, що
 * `modules/nutrition/analyze-photo.ts`), з `allowOpenRouter` обчисленим
 * із `LLM_RECEIPT_PROVIDER`/`OPENROUTER_API_KEY` (`visionTransport.ts`).
 * Кидає (не повертає error-обʼєкт) на upstream-невдачі — той самий
 * контракт, що `anthropicMessages`-callers по всьому репо (nutrition,
 * chat): caller-у не треба розрізняти "throw" і "ok:false", `errorHandler`
 * мапить `ExternalServiceError` у клієнтський 502/503 сам.
 */
export async function callReceiptVision(
  input: ReceiptVisionInput,
): Promise<string> {
  if (env.LLM_RECEIPT_PROVIDER === "stub") {
    return STUB_RECEIPT_VISION_TEXT;
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  const payload = {
    model: receiptVisionModel(),
    // 4000, НЕ 900/2000 (live-бенч 2026-08-18, два раунди): відповідь по
    // 18-позиційному чеку обрізалась на 900 токенах, по 40-позиційному
    // (буденний супермаркет-чек) — і на 2000 (~4000 символів JSON) —
    // extractJsonFromText давав null, draft приходив порожнім. 4000
    // токенів ≈ 80-100 позицій із запасом; вихідні токени flash-lite
    // коштують копійки, а обрізаний JSON — це втрачений чек цілком.
    max_tokens: 4000,
    temperature: 0.1,
    system: RECEIPT_VISION_SYSTEM_PROMPT,
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
          { type: "text", text: buildReceiptVisionUserPrompt() },
        ],
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20_000,
    endpoint: "finyk-receipts-analyze",
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
