/**
 * Voyage AI embedding client. Дзеркалить структуру `lib/anthropic.ts`:
 *  - timeout + abort + retry на transient статуси;
 *  - prom-метрики через `recordExternalHttp`;
 *  - circuit-breaker для захисту від rate-limit storm-у.
 *
 * Voyage docs: https://docs.voyageai.com/reference/embeddings-api
 *
 * Notes: робимо НЕ через global SDK-package. Voyage SDK у npm
 * (`voyageai`) тягне axios + python-style API. Власний fetch — простіше
 * і консистентно з існуючим Anthropic-pattern-ом.
 */

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { aiCostEstimateUsd, aiTokensTotal } from "../../obs/metrics.js";
import { CircuitBreaker, CircuitOpenError } from "../../lib/circuitBreaker.js";
import type { EmbeddingMetadata, EmbeddingProvider } from "./types.js";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * Voyage AI per-million-token pricing (USD). Sources:
 * https://docs.voyageai.com/docs/pricing — як на 2026-Q1.
 *
 * Match-имо по model-prefix через `pickVoyagePricing()` (`startsWith`),
 * щоб майбутні subversions (`-2024xx-yy`) того самого сімейства брали ту
 * саму ціну. Невідома модель → cost-counter не інкрементується (PR-33).
 */
const VOYAGE_PRICING_USD_PER_MTOK: Record<string, number> = {
  // 2025-line — multilingual, output_dimension up to 1024
  "voyage-3.5-lite": 0.02,
  "voyage-3.5": 0.06,
  "voyage-3-large": 0.18,
  "voyage-3-lite": 0.02,
  "voyage-3": 0.06,
  "voyage-code-3": 0.18,
  "voyage-multimodal-3": 0.06,
  // 2024-line (legacy, кількадомен-specific)
  "voyage-finance-2": 0.12,
  "voyage-law-2": 0.12,
  "voyage-2": 0.1,
};

function pickVoyagePricing(model: string): number | null {
  if (!model || model === "unknown") return null;
  for (const [prefix, price] of Object.entries(VOYAGE_PRICING_USD_PER_MTOK)) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

/**
 * Записує Voyage usage у Prometheus: tokens-counter (`ai_tokens_total`,
 * `kind="prompt"` бо embedding ≈ prompt у термінах biling-у Voyage) і
 * cost-counter (`ai_cost_estimate_usd_total`). PR-33 — multi-provider
 * cost dashboard. Запис безпечний: будь-який throw глушиться щоб не
 * ламати embedding-flow на metrics-помилці.
 */
export function recordVoyageUsage(
  model: string,
  tokens: number | null | undefined,
  endpoint: string = "embed",
): void {
  try {
    if (!Number.isFinite(tokens) || (tokens ?? 0) <= 0) return;
    const tokenCount = tokens as number;
    aiTokensTotal.inc(
      { provider: "voyage", model, endpoint, kind: "prompt" },
      tokenCount,
    );
    const pricePerMTok = pickVoyagePricing(model);
    if (pricePerMTok != null) {
      const usd = (tokenCount * pricePerMTok) / 1_000_000;
      if (usd > 0) {
        aiCostEstimateUsd.inc({ provider: "voyage", model, endpoint }, usd);
      }
    }
  } catch {
    /* metrics must never break a request */
  }
}

/**
 * Помилка коли `VOYAGE_API_KEY` не сконфігуровано. Окремо від
 * `VoyageHttpError` — caller хоче розрізняти "конфіг проблема,
 * не ретрай" від "Voyage недоступний, можна ретрайнути".
 */
export class MissingVoyageApiKeyError extends Error {
  readonly code = "MISSING_VOYAGE_API_KEY";
  constructor() {
    super(
      "VOYAGE_API_KEY is not configured. Set it in env or disable AI_MEMORY_ENABLED.",
    );
    this.name = "MissingVoyageApiKeyError";
  }
}

/**
 * HTTP-помилка від Voyage. `status` — HTTP status code; `retryable`
 * — чи варто ретраїти (5xx, 408, 429 з Retry-After).
 */
export class VoyageHttpError extends Error {
  readonly code = "VOYAGE_HTTP_ERROR";
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, body: string, retryable: boolean) {
    super(`Voyage HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    this.name = "VoyageHttpError";
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Помилка валідації Voyage-відповіді. Якщо API повернуло JSON, але
 * не за схемою (нема `data[].embedding` або `dim` не співпадає з
 * `VOYAGE_EMBEDDING_DIM`) — це serverside зміна контракту, не
 * ретраїбельна.
 */
export class VoyageContractError extends Error {
  readonly code = "VOYAGE_CONTRACT_ERROR";
  constructor(message: string) {
    super(`Voyage contract violation: ${message}`);
    this.name = "VoyageContractError";
  }
}

interface VoyageEmbeddingItem {
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingResponse {
  data: VoyageEmbeddingItem[];
  model: string;
  usage?: {
    total_tokens?: number;
  };
}

/**
 * Circuit breaker для Voyage. Окремий від Anthropic — embedд'инг і
 * chat — різні провайдери, breaker одного не має псувати breaker
 * іншого.
 */
const voyageCircuitBreaker = new CircuitBreaker({
  name: "voyage",
  threshold: env.AI_CIRCUIT_BREAKER_THRESHOLD,
  resetTimeoutMs: env.AI_CIRCUIT_BREAKER_RESET_MS,
});

function isRetryableStatus(status: number): boolean {
  // 408 (Request Timeout), 429 (Rate Limit), 5xx — все retryable.
  // 4xx (крім 408/429) — клієнтська помилка, не ретраїмо.
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CreateVoyageEmbeddingsOptions {
  /**
   * Дозволяє інжектити custom fetch для тестів. Default — глобальний
   * `fetch` (Node 20+). Виклик так само як `globalThis.fetch`.
   */
  fetchFn?: typeof fetch;
}

/**
 * Створює EmbeddingProvider з Voyage API. Кожен виклик `embedBatch`
 * розбиває вхідний масив на batch-и розміру `VOYAGE_BATCH_SIZE` і
 * шле паралельно (Voyage API дозволяє concurrent-запити в межах
 * rate-limit-у; окремий batch — окрема Promise → circuit-breaker
 * рахує per-batch outcome).
 *
 * Рекомендований usage:
 * ```ts
 * const provider = createVoyageEmbeddings();
 * const vectors = await provider.embedBatch(["text1", "text2"]);
 * ```
 */
export function createVoyageEmbeddings(
  options: CreateVoyageEmbeddingsOptions = {},
): EmbeddingProvider {
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const meta: EmbeddingMetadata = {
    provider: "voyage",
    model: env.VOYAGE_EMBEDDING_MODEL,
    version: env.AI_MEMORY_EMBEDDING_VERSION,
    dim: env.VOYAGE_EMBEDDING_DIM,
  };

  async function callVoyage(texts: string[]): Promise<Float32Array[]> {
    if (!env.VOYAGE_API_KEY) {
      throw new MissingVoyageApiKeyError();
    }
    if (texts.length === 0) return [];

    const maxAttempts = env.VOYAGE_MAX_RETRIES + 1;
    const retryDelayMs = [0, 250, 750, 2_000];
    const overallStart = process.hrtime.bigint();

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        env.VOYAGE_TIMEOUT_MS,
      );
      try {
        if (retryDelayMs[attempt - 1]) {
          await sleep(retryDelayMs[attempt - 1]!);
        }

        const response = await fetchFn(VOYAGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({
            input: texts,
            model: env.VOYAGE_EMBEDDING_MODEL,
            input_type: "document",
            output_dimension: env.VOYAGE_EMBEDDING_DIM,
            output_dtype: "float",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const retryable = isRetryableStatus(response.status);
          if (retryable && attempt < maxAttempts) {
            lastError = new VoyageHttpError(response.status, body, true);
            continue;
          }
          const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
          recordExternalHttp(
            "voyage",
            response.status === 429 ? "rate_limited" : "error",
            ms,
          );
          throw new VoyageHttpError(response.status, body, retryable);
        }

        const json = (await response.json()) as VoyageEmbeddingResponse;
        const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
        recordExternalHttp("voyage", "ok", ms);
        // PR-33 — записуємо токени та USD-вартість окремо від
        // `external_http_*` (ті лейблами не несуть `model`, тому per-model
        // billing dashboard на них не побудуєш). `usage.total_tokens` —
        // це сума input-токенів усього batch-у; саме що нам треба для
        // cost-attribution-у.
        recordVoyageUsage(
          json.model || env.VOYAGE_EMBEDDING_MODEL,
          json.usage?.total_tokens,
        );

        if (!Array.isArray(json.data) || json.data.length !== texts.length) {
          throw new VoyageContractError(
            `expected data.length=${texts.length}, got ${json.data?.length ?? 0}`,
          );
        }

        // Voyage API не гарантує порядок: items мають `index` поле,
        // що мап-ить response[i] на input[index]. Ми сортуємо по
        // `index` явно, бо 95% викликів — порядок коректний, але
        // 5% (особливо при retry-сценаріях провайдера) — переплутаний.
        const sorted = [...json.data].sort((a, b) => a.index - b.index);

        const result: Float32Array[] = [];
        for (let i = 0; i < sorted.length; i++) {
          const item = sorted[i];
          if (item!.index !== i) {
            throw new VoyageContractError(
              `non-contiguous indices: expected ${i}, got ${item!.index}`,
            );
          }
          if (!Array.isArray(item!.embedding)) {
            throw new VoyageContractError(
              `data[${i}].embedding is not an array`,
            );
          }
          if (item!.embedding.length !== env.VOYAGE_EMBEDDING_DIM) {
            throw new VoyageContractError(
              `data[${i}].embedding has dim=${item!.embedding.length}, expected ${env.VOYAGE_EMBEDDING_DIM}`,
            );
          }
          result.push(Float32Array.from(item!.embedding));
        }
        return result;
      } catch (error) {
        // AbortError під час timeout — retryable, бо конкретно цей
        // attempt таймнувся (Voyage міг бути живий, просто слабенький).
        if (
          error instanceof Error &&
          error.name === "AbortError" &&
          attempt < maxAttempts
        ) {
          lastError = error;
          continue;
        }
        // Все інше — наша custom-помилка або final-attempt timeout.
        if (
          error instanceof VoyageContractError ||
          error instanceof VoyageHttpError ||
          error instanceof MissingVoyageApiKeyError
        ) {
          throw error;
        }
        if (attempt >= maxAttempts) {
          const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
          recordExternalHttp(
            "voyage",
            error instanceof Error && error.name === "AbortError"
              ? "timeout"
              : "error",
            ms,
          );
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw (
      lastError ??
      new Error(
        `Voyage failed after ${maxAttempts} attempts without specific error`,
      )
    );
  }

  return {
    meta,
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];

      // Розбиваємо на batch-и розміру VOYAGE_BATCH_SIZE.
      const batches: string[][] = [];
      for (let i = 0; i < texts.length; i += env.VOYAGE_BATCH_SIZE) {
        batches.push(texts.slice(i, i + env.VOYAGE_BATCH_SIZE));
      }

      // Паралельно через breaker — кожен batch окремий "logical
      // operation" для circuit-breaker-а (не агрегуємо успіх/фейл).
      try {
        const results = await Promise.all(
          batches.map((batch) =>
            voyageCircuitBreaker.execute(() => callVoyage(batch)),
          ),
        );
        return results.flat();
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          recordExternalHttp("voyage", "circuit_open", null);
          logger.warn({
            msg: "voyage_circuit_open",
            retryAfterMs: error.retryAfterMs,
          });
        }
        throw error;
      }
    },
  };
}
