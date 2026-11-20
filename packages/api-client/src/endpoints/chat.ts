import {
  ChatStreamFrameSchema,
  ChatUsageResponseSchema,
} from "@sergeant/shared";
import type {
  ChatFirstTurnResponse,
  ChatPreset,
  ChatStreamFrame,
  ChatUsageResponse,
} from "@sergeant/shared";
import { ApiError } from "../ApiError";
import type { HttpClient } from "../httpClient";

export type {
  ChatFirstTurnResponse,
  ChatPreset,
  ChatStreamFrame,
  ChatUsageResponse,
};

/**
 * Розбирає payload одного рядка `data:` SSE `/api/chat` (без префікса).
 * `null` — кінець потоку (`[DONE]`), битий JSON або кадр невідомої форми:
 * новий сервер може додати кадр, і старий клієнт має його пропустити, а не
 * впасти. Форма кадрів — `ChatStreamFrameSchema` (`@sergeant/shared`).
 */
export function parseChatStreamFrame(raw: string): ChatStreamFrame | null {
  if (raw === "[DONE]") return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ChatStreamFrameSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export interface ChatMessage {
  role: "user" | "assistant" | string;
  content: string;
}

export interface ChatRequestPayload {
  context: string;
  messages: ChatMessage[];
  tool_results?: unknown;
  tool_calls_raw?: unknown;
  /**
   * `true` — відповідь SSE (`text/event-stream`, кадри `ChatStreamFrame`).
   * Перший хід стрімить сервер із 2026-11-18 (кадри `t` / `tool` / `final` /
   * `err`); старий сервер на перший хід відповідає JSON, тож клієнт мусить
   * дивитись на `content-type`, а не на прапорець. Тур синтезу: `t` / `err`.
   */
  stream?: boolean;
  /**
   * Сценарний режим розмови. Ідентифікатор із `CHAT_PRESETS`; текст
   * інструкції живе на сервері (`apps/server/src/modules/chat/chatPresets.ts`)
   * і в клієнтський бандл не потрапляє. Preset також переводить запит на
   * власне тижневе відро AI-квоти — див. `resolvePresetBudget` в `aiQuota.ts`.
   */
  preset?: ChatPreset;
  /**
   * AI-5 рішення 1 (`docs/work/specs/audits/2026-09-01-product-audit/findings.md`)
   * — echo назад значення `ChatResponse.round_trip_ticket` з першого-турового
   * `tool_calls`-виклику. Дозволяє серверу впізнати цей запит як другий
   * (tool-result-синтезний) HTTP-виклик того самого ходу і не списувати
   * другий квиток денної AI-квоти. Пропущене поле просто означає звичайне
   * списання — не контракт, а optimization.
   */
  round_trip_ticket?: string;
  /**
   * С-2 (б): клієнт уміє другий раунд інструментів. Тоді відповідь на запит
   * синтезу після пошуку може бути `ChatResponse` з `tool_calls` (виклики
   * запису) і `round_trip_ticket` другого раунду замість тексту; клієнт
   * виконує їх і шле синтез обох раундів із цим квитком. Без поля сервер
   * другого раунду не робить.
   */
  second_tool_round?: boolean;
}

export interface ChatResponse {
  text?: string;
  tool_calls?: Array<{ id: string; [key: string]: unknown }>;
  tool_calls_raw?: unknown;
  error?: string;
  /**
   * Присутнє лише коли `tool_calls` непорожній і сесія відома серверу.
   * Клієнт echo-ить це значення назад у `ChatRequestPayload.round_trip_ticket`
   * другого запиту (`chatApi.stream`). Див. докстрінг там же.
   */
  round_trip_ticket?: string;
}

export interface ChatCallOpts {
  /** Скасувати активний запит (AbortController у HubChat). */
  signal?: AbortSignal;
}

/** Колбеки стріму першого ходу (С-1 (а)). */
export interface ChatFirstTurnOpts extends ChatCallOpts {
  /** Шматок тексту, який модель пише просто зараз. */
  onText?: (delta: string) => void;
  /** Модель почала виклик інструмента: ранній підпис кроку. */
  onTool?: (name: string) => void;
}

/**
 * Збій стрімового першого ходу ПІСЛЯ того, як потік відкрито: кадр `err` від
 * сервера або обрив без кадру `final`. `code` — стабільний код сервера
 * (`MAX_TOOL_ITERATIONS`), якщо він був.
 */
export class ChatStreamError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
  }
}

/** Текст обриву без кадру `final` (`ChatStreamError.message`). */
export const CHAT_STREAM_INTERRUPTED = "Відповідь обірвалась";

/**
 * Стеля байтів потоку першого ходу. Кадр `final` несе `tool_calls_raw` з
 * результатами пошуку інструментів, тож стеля ширша за текстовий стрім.
 */
const FIRST_TURN_MAX_BYTES = 1024 * 1024;

async function readFirstTurnSse(
  res: Response,
  opts: ChatFirstTurnOpts,
): Promise<ChatResponse> {
  const reader = res.body?.getReader();
  if (!reader) throw new ChatStreamError(CHAT_STREAM_INTERRUPTED);
  const dec = new TextDecoder();
  let buf = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    if (total > FIRST_TURN_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ChatStreamError(CHAT_STREAM_INTERRUPTED);
    }
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const frame = parseChatStreamFrame(line.slice(6).trim());
      if (!frame) continue;
      if ("t" in frame) opts.onText?.(frame.t);
      else if ("tool" in frame) opts.onTool?.(frame.tool);
      else if ("err" in frame) throw new ChatStreamError(frame.err, frame.code);
      else {
        await reader.cancel().catch(() => {});
        return frame.final as ChatResponse;
      }
    }
  }
  throw new ChatStreamError(CHAT_STREAM_INTERRUPTED);
}

/**
 * Відповідь без SSE: старий сервер (до 2026-11-18 перший хід завжди JSON) або
 * помилка до відкриття потоку. Помилки — у тій самій формі, що `send()`.
 */
async function readFirstTurnJson(res: Response): Promise<ChatResponse> {
  const bodyText = await res.text();
  let body: unknown;
  let parseFailed = false;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parseFailed = true;
    body = undefined;
  }
  if (!res.ok) {
    const serverMessage =
      body && typeof body === "object"
        ? (body as { error?: unknown }).error
        : undefined;
    throw new ApiError({
      kind: "http",
      message:
        typeof serverMessage === "string" && serverMessage.length > 0
          ? serverMessage
          : `HTTP ${res.status}`,
      status: res.status,
      body,
      bodyText,
      url: res.url,
      requestId: res.headers.get("x-request-id") || undefined,
    });
  }
  if (parseFailed) {
    throw new ApiError({
      kind: "parse",
      message: "Некоректна відповідь сервера",
      url: res.url,
      bodyText,
    });
  }
  return body as ChatResponse;
}

export interface ChatEndpoints {
  send: (
    payload: ChatRequestPayload,
    opts?: ChatCallOpts,
  ) => Promise<ChatResponse>;
  stream: (
    payload: ChatRequestPayload,
    opts?: ChatCallOpts,
  ) => Promise<Response>;
  /**
   * Перший хід зі стрімом (С-1 (а)): просить `stream: true`, віддає текст і
   * кроки колбеками і повертає зібрану відповідь у формі `send()`. Старий
   * сервер відповідає JSON — тоді колбеків немає, а результат той самий.
   * Збій після відкриття потоку — `ChatStreamError`.
   */
  firstTurn: (
    payload: ChatRequestPayload,
    opts?: ChatFirstTurnOpts,
  ) => Promise<ChatResponse>;
  /** GET /api/chat/usage — Free-tier daily counter (PR-42 chat counter). */
  usage: (opts?: ChatCallOpts) => Promise<ChatUsageResponse>;
}

export function createChatEndpoints(http: HttpClient): ChatEndpoints {
  return {
    send: (payload, opts = {}) =>
      http.post<ChatResponse>("/api/chat", payload, { signal: opts.signal }),
    stream: (payload, opts = {}) =>
      http.raw("/api/chat", {
        method: "POST",
        body: payload,
        signal: opts.signal,
      }),
    firstTurn: async (payload, opts = {}) => {
      const res = await http.raw("/api/chat", {
        method: "POST",
        body: { ...payload, stream: true },
        signal: opts.signal,
      });
      const ct = res.headers.get("content-type") || "";
      return res.ok && ct.includes("text/event-stream")
        ? readFirstTurnSse(res, opts)
        : readFirstTurnJson(res);
    },
    usage: async (opts = {}) => {
      const raw = await http.get<unknown>("/api/chat/usage", {
        signal: opts.signal,
      });
      return ChatUsageResponseSchema.parse(raw);
    },
  };
}
