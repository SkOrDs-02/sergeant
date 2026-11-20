/**
 * Прод-транспорт зорового стенду: рівно той виклик, яким прод відправляє
 * зображення моделі.
 *
 * AI-CONTEXT: до 2026-11-19 стенд ходив через `/chat/completions` з
 * `image_url`, а прод зору, чеків і виписок — через Anthropic-сумісний
 * `/api/v1/messages` шлюзу (`anthropicMessages` з `allowOpenRouter`). Це дві
 * різні граматики, і відповідь моделі на них не мусить збігатись, тож
 * висновок «модель X гірша на зорі» стосувався не того шляху. Тепер стенд
 * кличе ту саму `anthropicMessages` (ретраї на 429, таймаути, `provider`-
 * преференції з `openrouterDataPolicy.ts`), а тіло будує з тих самих
 * промптів і параметрів. Паритет тіла з продом стереже
 * `src/lib/evalVisionProdParity.test.ts`: він ловить, що прод передає в
 * `anthropicMessages`, і порівнює з білдерами нижче байт у байт.
 *
 * Глибина міркувань: кандидат без `reasoning` отримує те саме поле, що
 * поставив би прод (`ProdVisionShape.reasoningFields`; з 2026-11-19 чек і
 * виписка шлють `thinking: {type: "disabled"}` за
 * `RECEIPT_VISION_REASONING_EFFORT`, зір нутриції глибину не шле). Кандидат
 * із `reasoning` (5-те поле `--extra`) перекриває це явним значенням.
 */

import { env } from "../../src/env/env.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../src/lib/anthropic.js";
import {
  buildImportScreenshotUserPrompt,
  IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT,
} from "../../src/modules/finyk/import/prompts.js";
import {
  buildReceiptVisionUserPrompt,
  RECEIPT_VISION_SYSTEM_PROMPT,
} from "../../src/modules/finyk/receipts/prompts.js";
import { firstTurnReasoningFields } from "../../src/modules/chat/chatReasoning.js";
import { receiptVisionReasoningFields } from "../../src/modules/finyk/receipts/visionTransport.js";
import type { Candidate } from "./types.js";

export interface VisionImage {
  base64: string;
  mimeType: string;
}

/** Параметри одного продового виклику (без моделі й зображення). */
export interface ProdVisionShape {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** `endpoint` метрик прода — для стенду з префіксом `internal/vision-eval/`. */
  prodEndpoint: string;
  /** Поле глибини, яке прод додає в кінець тіла для цієї моделі. */
  reasoningFields?: (model: string) => Record<string, unknown>;
}

/** `callReceiptVision` (`modules/finyk/receipts/visionClient.ts`). */
export function receiptShape(): ProdVisionShape {
  return {
    system: RECEIPT_VISION_SYSTEM_PROMPT,
    user: buildReceiptVisionUserPrompt(),
    maxTokens: 4000,
    temperature: 0.1,
    timeoutMs: 20_000,
    prodEndpoint: "finyk-receipts-analyze",
    reasoningFields: receiptVisionReasoningFields,
  };
}

/** `callImportScreenshotVision` (`modules/finyk/import/visionClient.ts`). */
export function statementShape(todayKyiv: string): ProdVisionShape {
  return {
    system: IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT,
    user: buildImportScreenshotUserPrompt(todayKyiv),
    maxTokens: 8000,
    temperature: 0.1,
    timeoutMs: 45_000,
    prodEndpoint: "finyk-import-screenshot-analyze",
    reasoningFields: receiptVisionReasoningFields,
  };
}

/** `analyze-photo.ts` / `refine-photo.ts` (system і user — з їхніх білдерів). */
export function photoShape(
  kind: "analyze-photo" | "refine-photo",
  prompt: { system: string; user: string },
): ProdVisionShape {
  return {
    system: prompt.system,
    user: prompt.user,
    maxTokens: kind === "analyze-photo" ? 1000 : 950,
    temperature: 0.2,
    timeoutMs: 20_000,
    prodEndpoint: kind,
  };
}

/** Тіло `/messages` у тому порядку полів і тій формі, що будує прод. */
export function buildProdVisionPayload(
  model: string,
  shape: ProdVisionShape,
  image: VisionImage,
): Record<string, unknown> {
  return {
    model,
    max_tokens: shape.maxTokens,
    temperature: shape.temperature,
    system: shape.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mimeType,
              data: image.base64,
            },
          },
          { type: "text", text: shape.user },
        ],
      },
    ],
  };
}

/**
 * Тіло стенда для кандидата: продове тіло плюс поле глибини. Без явного
 * `reasoning` — рівно те, що додав би прод (тест паритету порівнює саме
 * цю функцію з тілом, яке передає прод).
 */
export function benchVisionPayload(
  candidate: Candidate,
  shape: ProdVisionShape,
  image: VisionImage,
): Record<string, unknown> {
  const reasoning =
    candidate.provider !== "openrouter"
      ? {}
      : candidate.reasoning === undefined
        ? (shape.reasoningFields?.(candidate.model) ?? {})
        : candidate.reasoning === "minimal"
          ? // Граматика та сама, що в першого ходу; `minimal` (gemini-3.5) у
            // чатовий тип не входить, тож окремою гілкою.
            { output_config: { effort: "minimal" } }
          : firstTurnReasoningFields(candidate.reasoning);
  return {
    ...buildProdVisionPayload(candidate.model, shape, image),
    ...reasoning,
  };
}

export interface ProdVisionCall {
  ok: boolean;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  servedBy: string | null;
  gatewayCostUsd: number | null;
  stopReason: string | null;
  /** HTTP-статус кожної спроби (ретраї `anthropicMessages` включно). */
  attemptStatuses: number[];
  /** Статус фінальної відповіді; `null` — винятoк (таймаут, мережа). */
  finalStatus: number | null;
  error?: string;
}

/**
 * Обгортка над глобальним `fetch` на час одного виклику: записує статус
 * кожної спроби. `anthropicMessages` сам ретраїть 429/5xx, і без цього 429,
 * «проковтнуті» ретраєм, у звіті не видно — а саме вони показують тиск
 * квоти на єдиному ендпойнті (§ 6.4 дослідження: 18 із 75).
 *
 * Стенд іде послідовно, тож перехоплення на один виклик безпечне. Хост не
 * фільтруємо: усередині `fn` мережу кличе лише `anthropicMessages` (шлюз чи
 * прямий Anthropic), а `provider`-поля тіла додає вона ж через
 * `withOpenRouterProviderPrefs` — тут тіла не будується.
 */
async function withAttemptTap<T>(
  statuses: number[],
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    const res = await original(input, init);
    statuses.push(res.status);
    return res;
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/**
 * Один продовий виклик через шлюз. `ANTHROPIC_API_KEY` передається, як у
 * проді, але з `allowOpenRouter: true` і заданим `OPENROUTER_API_KEY`
 * `pickTransport` іде на шлюз; без ключа шлюзу виклик чесно падає на прямий
 * Anthropic, і `servedBy` лишиться `null`.
 */
export async function callProdVision(
  candidate: Candidate,
  shape: ProdVisionShape,
  image: VisionImage,
  endpointTag: string,
): Promise<ProdVisionCall> {
  const payload = benchVisionPayload(candidate, shape, image);
  const statuses: number[] = [];
  try {
    const { response, data } = await withAttemptTap(statuses, () =>
      anthropicMessages(env.ANTHROPIC_API_KEY, payload, {
        timeoutMs: shape.timeoutMs,
        endpoint: endpointTag,
        allowOpenRouter: candidate.provider === "openrouter",
      }),
    );
    const body = (data ?? {}) as {
      usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
      provider?: unknown;
      stop_reason?: unknown;
      error?: { message?: string };
    };
    const base = {
      attemptStatuses: statuses,
      finalStatus: response?.status ?? null,
      servedBy: typeof body.provider === "string" ? body.provider : null,
      gatewayCostUsd:
        typeof body.usage?.cost === "number" ? body.usage.cost : null,
      stopReason:
        typeof body.stop_reason === "string" ? body.stop_reason : null,
    };
    if (!response || !response.ok) {
      return {
        ...base,
        ok: false,
        text: "",
        inputTokens: null,
        outputTokens: null,
        error:
          body.error?.message ??
          `HTTP ${response?.status ?? "немає відповіді"}`,
      };
    }
    return {
      ...base,
      ok: true,
      text: extractAnthropicText(data),
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      text: "",
      inputTokens: null,
      outputTokens: null,
      servedBy: null,
      gatewayCostUsd: null,
      stopReason: null,
      attemptStatuses: statuses,
      finalStatus: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}
