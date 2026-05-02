/**
 * Handler `POST /api/ai-memory/recall` — semantic memory retrieval.
 *
 * Розв'язує задачу: "знайди top-K схожих записів для запиту юзера". Викликають
 * двоє caller-ів:
 *   1. HubChat tool `recall_memory` (`apps/web/src/core/lib/chatActions/`) —
 *      коли LLM явно вирішив пошукати у memory bank.
 *   2. RAG-injection в `/api/chat` (через `ragContext.ts`) — на кожному
 *      першому кроці чат-запиту, щоб додати контекст у system prompt.
 *
 * Контракт навмисно мінімальний — `{ query, topK?, sources? }`. Сервіс сам
 * займеться embedding-ом query (`aiMemory.recall`) і ANN-пошуком у pgvector.
 *
 * **Не плутати з `/api/ai-memory/ingest`** (write-path, BullMQ async). Recall
 * — sync read-path: блокуємо HTTP-handler на час Voyage embed (~300мс) +
 * pgvector query (~10мс). Sync навмисно: chat-handler чекає на результат
 * перш ніж дзвонити Anthropic, тому async-черга тут зайва.
 */

import type { Request, Response } from "express";

import {
  RecallMemoryRequestSchema,
  type RecallMemoryResponse,
} from "@sergeant/shared";

import { env } from "../../env.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import { getAiMemory } from "./bootstrap.js";
import {
  MissingVoyageApiKeyError,
  VoyageHttpError,
  VoyageContractError,
} from "./embeddings.js";
import { CircuitOpenError } from "../../lib/circuitBreaker.js";
import type { MemorySource } from "./types.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * POST /api/ai-memory/recall.
 *
 * Status codes:
 *   - 200 + `{ memories: [...] }` — happy path; масив може бути порожнім.
 *   - 400 — schema validation fail (validateBody).
 *   - 401 — без сесії (router middleware `requireSession`).
 *   - 503 — `AI_MEMORY_ENABLED=false` АБО провайдер недоступний (Voyage 5xx /
 *           circuit open / missing API key). Семантика "тимчасово недоступний"
 *           краще за 500: клієнт може ретрайнути; Sentry не плодить alert-и
 *           при відомому розладі провайдера.
 *   - 500 — несподівана помилка (наприклад, pgvector connection drop).
 */
export async function recallMemoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!env.AI_MEMORY_ENABLED) {
    res.status(503).json({
      error: "AI memory вимкнено на сервері",
      code: "AI_MEMORY_DISABLED",
    });
    return;
  }

  const parsed = validateBody(RecallMemoryRequestSchema, req, res);
  if (!parsed.ok) return;
  const { query, topK, sources } = parsed.data;

  const userId = (req as WithSessionUser).user!.id;

  try {
    const results = await getAiMemory().recall({
      userId,
      query,
      topK,
      sources: sources as MemorySource[] | undefined,
    });

    const payload: RecallMemoryResponse = {
      memories: results.map((r) => ({
        id: r.id,
        source: r.source,
        sourceRef: r.sourceRef,
        content: r.content,
        score: r.score,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
    };

    logger.info({
      msg: "ai_memory_recall_route_ok",
      userId,
      queryLen: query.length,
      topK: topK ?? env.AI_MEMORY_TOP_K,
      sources: sources ?? [],
      count: payload.memories.length,
    });

    res.status(200).json(payload);
  } catch (err) {
    if (
      err instanceof MissingVoyageApiKeyError ||
      err instanceof CircuitOpenError ||
      err instanceof VoyageHttpError ||
      err instanceof VoyageContractError
    ) {
      logger.warn({
        msg: "ai_memory_recall_provider_unavailable",
        userId,
        err: err.message,
        code: "code" in err ? (err as { code?: string }).code : undefined,
      });
      res.status(503).json({
        error: "Провайдер ембеддингів тимчасово недоступний",
        code: "EMBEDDING_PROVIDER_UNAVAILABLE",
      });
      return;
    }
    logger.error({
      msg: "ai_memory_recall_route_unexpected_error",
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: "Не вдалося виконати recall",
      code: "RECALL_FAILED",
    });
  }
}
