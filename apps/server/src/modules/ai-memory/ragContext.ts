/**
 * RAG-context augmentation для `/api/chat`.
 *
 * Розв'язує задачу: "до того як модель почне думати, додай у system prompt
 * top-K схожих записів з ai_memories на ОСТАННЄ user-повідомлення". Дзеркало
 * tool-у `recall_memory`, але:
 *   - тригериться **автоматично** на кожному першому турі (не tool-result),
 *   - менший top-K (`AI_MEMORY_RAG_TOP_K`, default 4) проти явного recall (8),
 *   - **не** ходить у Voyage поза `/api/chat`, не викликає Anthropic.
 *
 * Дизайн:
 *   - sync read-path: блокуємо chat handler на ~300мс (Voyage embed) +
 *     ~10мс (pgvector ANN). Цей wall-time приховується від юзера, бо ми
 *     рендеримо TIME-FIRST контекст ще до того як викликати Anthropic, який
 *     і так стартує stream через ~500мс. Кеш Anthropic prompt-у не страждає
 *     (RAG-блок іде ПІСЛЯ cached SYSTEM_PREFIX, не міксується в кешований
 *     префікс).
 *   - **не падаємо при помилці**: будь-яка помилка (відключений flag,
 *     timeout, circuit-open Voyage, missing API key, pgvector down) —
 *     повертаємо порожній рядок. Чат лишається працездатним без памʼяті.
 *   - timeout — `AI_MEMORY_RAG_TIMEOUT_MS` (default 1500мс). Жорстке вікно,
 *     щоб блокувати chat ≤1.5с навіть на хворому Voyage.
 *
 * Не плутати з `recall_memory` HubChat-tool-ом: той запускається коли модель
 * прийняла рішення "пошукай схожі записи"; цей — preemptive injection.
 */

import { setTimeout as setTimeoutP } from "node:timers/promises";

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import { getAiMemory } from "./bootstrap.js";

/**
 * Жорстке вікно очікування Voyage + pgvector (мс). Менше за дефолтний
 * Anthropic timeout-у `/api/chat` (30с), щоб RAG ніколи не "зїв" увесь
 * SLA. Перевищення — мовчазний skip без помилки клієнту.
 */
const RAG_TIMEOUT_MS = env.AI_MEMORY_RAG_TIMEOUT_MS;

/** Найкоротший user query, для якого має сенс шукати в памʼяті. */
const MIN_QUERY_LEN = 6;

/**
 * Максимальна довжина одного memory в RAG-блоці. Truncate на сервері, бо
 * пам'ять зберігається з повним content-ом, а тут ми хочемо зберегти кеш-
 * блок невеликим (4 × 200 ≈ 800 токенів — вписується в один cache-block).
 */
const MEMORY_TRUNCATE_LEN = 200;

const SOURCE_LABEL_UK: Record<string, string> = {
  chat: "чат",
  finyk: "Фінік",
  fizruk: "Фізрук",
  nutrition: "Харчування",
  routine: "Рутина",
  journal: "журнал",
  digest: "дайджест",
};

interface MaybeUserChatMessage {
  role?: unknown;
  content?: unknown;
}

/**
 * Витягує найновіше user-повідомлення з масиву чат-історії. Інколи фронт
 * додає trailing assistant tool_use/tool_result-и; останній "запит" юзера —
 * це останнє повідомлення з role==='user'.
 */
function lastUserContent(messages: readonly MaybeUserChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const t = m.content.trim();
      if (t) return t;
    }
  }
  return "";
}

/**
 * Форматує RAG-блок у вигляді, де модель не плутатиме memory-content із
 * директивами в system prompt. Заголовок — заборона "цитувати" блок як
 * фактаж сторонніх осіб; кожен запис — дата + джерело + truncated content.
 */
function formatRagBlock(
  memories: ReadonlyArray<{
    source: string;
    content: string;
    createdAt: Date;
    score: number;
  }>,
): string {
  if (memories.length === 0) return "";
  const lines: string[] = [
    "",
    "СХОЖІ ЗАПИСИ З ПАМʼЯТІ КОРИСТУВАЧА (для контексту, не цитуй дослівно):",
  ];
  for (const m of memories) {
    const sourceLabel = SOURCE_LABEL_UK[m.source] ?? m.source;
    const date = m.createdAt.toISOString().slice(0, 10);
    const content =
      m.content.length > MEMORY_TRUNCATE_LEN
        ? `${m.content.slice(0, MEMORY_TRUNCATE_LEN)}\u2026`
        : m.content;
    lines.push(`- [${sourceLabel} • ${date}] ${content}`);
  }
  return lines.join("\n");
}

interface BuildRagContextOptions {
  userId: string | null | undefined;
  baseContext: string;
  messages: readonly MaybeUserChatMessage[];
}

/**
 * Повертає `baseContext` (можливо) + RAG-suffix.
 *
 * Правила short-circuit (всі — без помилки):
 *   - `AI_MEMORY_ENABLED=false` → no-op;
 *   - `AI_MEMORY_RAG_TOP_K === 0` → no-op (A/B вимикач);
 *   - не сесійний user (відсутній userId) → no-op;
 *   - порожнє / занадто коротке user-повідомлення → no-op;
 *   - помилка / timeout → no-op + warn-лог.
 *
 * Завжди повертає string (`baseContext` як floor), щоб caller не дбав про
 * fallback-логіку.
 */
export async function buildRagContext({
  userId,
  baseContext,
  messages,
}: BuildRagContextOptions): Promise<string> {
  if (!env.AI_MEMORY_ENABLED) return baseContext;
  const topK = env.AI_MEMORY_RAG_TOP_K;
  if (!topK || topK <= 0) return baseContext;
  if (!userId) return baseContext;

  const query = lastUserContent(messages);
  if (query.length < MIN_QUERY_LEN) return baseContext;

  try {
    const recallPromise = getAiMemory().recall({
      userId,
      query,
      topK,
    });

    const timeoutSignal = AbortSignal.timeout(RAG_TIMEOUT_MS);
    const timeoutPromise = setTimeoutP(RAG_TIMEOUT_MS, "__timeout__", {
      signal: timeoutSignal,
    }).catch(() => "__timeout__");

    const winner = await Promise.race([recallPromise, timeoutPromise]);
    if (winner === "__timeout__") {
      logger.warn({
        msg: "ai_memory_rag_timeout",
        userId,
        topK,
        timeoutMs: RAG_TIMEOUT_MS,
      });
      return baseContext;
    }

    const ragBlock = formatRagBlock(
      winner as Awaited<ReturnType<ReturnType<typeof getAiMemory>["recall"]>>,
    );
    if (!ragBlock) return baseContext;

    logger.info({
      msg: "ai_memory_rag_injected",
      userId,
      topK,
      count: (winner as Array<unknown>).length,
      queryLen: query.length,
    });

    if (!baseContext) return ragBlock.replace(/^\n/, "");
    return `${baseContext}\n${ragBlock}`;
  } catch (err) {
    logger.warn({
      msg: "ai_memory_rag_error",
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return baseContext;
  }
}
