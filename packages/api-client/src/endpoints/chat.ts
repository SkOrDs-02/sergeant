import { ChatUsageResponseSchema } from "@sergeant/shared";
import type { ChatPreset, ChatUsageResponse } from "@sergeant/shared";
import type { HttpClient } from "../httpClient";

export type { ChatPreset, ChatUsageResponse };

export interface ChatMessage {
  role: "user" | "assistant" | string;
  content: string;
}

export interface ChatRequestPayload {
  context: string;
  messages: ChatMessage[];
  tool_results?: unknown;
  tool_calls_raw?: unknown;
  stream?: boolean;
  /**
   * Сценарний режим розмови. Ідентифікатор із `CHAT_PRESETS`; текст
   * інструкції живе на сервері (`apps/server/src/modules/chat/chatPresets.ts`)
   * і в клієнтський бандл не потрапляє. Preset також переводить запит на
   * власне тижневе відро AI-квоти — див. `resolvePresetBudget` в `aiQuota.ts`.
   */
  preset?: ChatPreset;
  /**
   * AI-5 рішення 1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`)
   * — echo назад значення `ChatResponse.round_trip_ticket` з першого-турового
   * `tool_calls`-виклику. Дозволяє серверу впізнати цей запит як другий
   * (tool-result-синтезний) HTTP-виклик того самого ходу і не списувати
   * другий квиток денної AI-квоти. Пропущене поле просто означає звичайне
   * списання — не контракт, а optimization.
   */
  round_trip_ticket?: string;
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

export interface ChatEndpoints {
  send: (
    payload: ChatRequestPayload,
    opts?: ChatCallOpts,
  ) => Promise<ChatResponse>;
  stream: (
    payload: ChatRequestPayload,
    opts?: ChatCallOpts,
  ) => Promise<Response>;
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
    usage: async (opts = {}) => {
      const raw = await http.get<unknown>("/api/chat/usage", {
        signal: opts.signal,
      });
      return ChatUsageResponseSchema.parse(raw);
    },
  };
}
