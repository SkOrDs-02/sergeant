/**
 * Async tool-handler-и, які вимагають серверного call-у. На відміну від
 * sync-handler-ів у `crossActions.ts` (writes у localStorage), ці викликають
 * `/api/ai-memory/...` і чекають мережу.
 *
 * Виноситься окремо, щоб:
 *  - sync handler-и (`handleCrossAction` тощо) лишилися sync і не "зїли" Promise-зворотки
 *    у `??`-чейн-і `dispatch`;
 *  - тести `executeAction(...)` (~30+ юніт-тестів) лишилися sync і не падали з
 *    `Promise.resolve(...)`-обгорткою;
 *  - локально це єдина точка, куди клієнт має право бити в HTTP — інші handler-и
 *    зумисно offline-only.
 *
 * Виклик `recall_memory` тут не truncate-ить content серверним лімітом
 * (`AI_MEMORY_RECALL_CONTENT_TRUNCATE_LEN` дзеркальована з PR2 `ingest`-у),
 * бо truncation вже відбулась on-write. Достатньо красивого формату.
 */

import { apiUrl } from "../../../shared/lib/api/apiUrl";
import type {
  RecallMemoryRequest,
  RecallMemoryResponse,
} from "@sergeant/shared";
import type { ChatAction, ChatActionResult, RecallMemoryAction } from "./types";

/**
 * Кількість мс, яку клієнт чекає на відповідь recall перш ніж скасувати
 * запит. Більше за середній RTT (Voyage embed ~300мс + pgvector query
 * ~10мс + мережа), але менше за upper-bound в чат-стрімі (60с), щоб
 * recall, що завис у Voyage 5xx, не утримував UI повністю.
 */
const RECALL_TIMEOUT_MS = 12_000;

const SOURCE_LABEL_UK: Record<string, string> = {
  chat: "чат",
  finyk: "Фінік",
  fizruk: "Фізрук",
  nutrition: "Харчування",
  routine: "Рутина",
  journal: "журнал",
  digest: "дайджест",
};

function formatRecallResults(
  query: string,
  memories: RecallMemoryResponse["memories"],
): string {
  if (memories.length === 0) {
    return `Не знайшов схожих записів для "${query}".`;
  }
  const lines: string[] = [
    `Знайшов ${memories.length} схожих записів для "${query}":`,
  ];
  for (const m of memories) {
    const sourceLabel = SOURCE_LABEL_UK[m.source] ?? m.source;
    const date = m.createdAt.slice(0, 10);
    const score = (m.score * 100).toFixed(0);
    const content =
      m.content.length > 200 ? `${m.content.slice(0, 200)}\u2026` : m.content;
    lines.push(`  - [${sourceLabel} • ${date} • ${score}%] ${content}`);
  }
  return lines.join("\n");
}

async function callRecallApi(
  body: RecallMemoryRequest,
): Promise<RecallMemoryResponse | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECALL_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl("/api/ai-memory/recall"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // M10 — CSRF guard. Решта app-у йде через `createHttpClient()`, який
        // виставляє цей хедер автоматично; цей raw fetch свідомо обмежений
        // одним handler-ом і має дзеркалити поведінку клієнта, інакше після
        // mount-у `requireCsrfHeader` сервер відстрілить запит 403.
        // Карта: `docs/security/hardening/M10-csrf-token-check.md`.
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 503) {
      return {
        error:
          "AI memory тимчасово недоступне. Спробуй пізніше або перевір налаштування.",
      };
    }
    if (res.status === 401) {
      return { error: "Потрібна авторизація для пошуку памʼяті." };
    }
    if (!res.ok) {
      return { error: `Помилка серверу при recall (HTTP ${res.status}).` };
    }
    return (await res.json()) as RecallMemoryResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "Recall таймаут — спробуй простіший запит." };
    }
    return { error: "Не вдалося звʼязатися з сервером для recall." };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `recall_memory` — async handler, що бʼє у `/api/ai-memory/recall`.
 * Повертає форматовану в Markdown-light строку (Anthropic tool_result).
 */
async function handleRecallMemory(action: RecallMemoryAction): Promise<string> {
  const { query, top_k, sources } = action.input ?? { query: "" };
  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  if (!trimmedQuery) {
    return "Потрібен непорожній query для recall_memory.";
  }
  const topKNum = Number(top_k);
  const topK =
    Number.isFinite(topKNum) && topKNum > 0 ? Math.floor(topKNum) : undefined;

  const body: RecallMemoryRequest = {
    query: trimmedQuery,
    ...(topK ? { topK } : {}),
    ...(Array.isArray(sources) && sources.length > 0
      ? { sources: sources as RecallMemoryRequest["sources"] }
      : {}),
  };

  const out = await callRecallApi(body);
  if ("error" in out) return out.error;
  return formatRecallResults(trimmedQuery, out.memories);
}

/**
 * Async dispatcher — повертає результат, якщо action — "server-side" tool,
 * інакше `undefined` (sync-flow обробить решту).
 *
 * Зберігаємо строкову форму `ChatActionResult` (без undo): recall — read-only,
 * undo не потрібен.
 */
export async function handleAsyncChatAction(
  action: ChatAction,
): Promise<ChatActionResult | undefined> {
  switch (action.name) {
    case "recall_memory":
      return handleRecallMemory(action as RecallMemoryAction);
    default:
      return undefined;
  }
}

/**
 * Whitelist tool-імен, що вимагають async/server-call. Імпортується у
 * `hubChatActions.ts` для швидкого pre-check без try/catch-у async pathу.
 */
export const ASYNC_CHAT_ACTION_NAMES: ReadonlySet<string> = new Set([
  "recall_memory",
]);
