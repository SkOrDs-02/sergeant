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
}

export interface ChatResponse {
  text?: string;
  tool_calls?: Array<{ id: string; [key: string]: unknown }>;
  tool_calls_raw?: unknown;
  error?: string;
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
