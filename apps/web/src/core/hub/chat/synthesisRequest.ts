/**
 * Запит туру синтезу після виконаних інструментів: стрім, якщо сервер його
 * віддав, інакше JSON. Винесено з `useChatSend.ts`, бо після С-2 (б) хід може
 * просити синтез двічі: сервер на запит після пошуку інколи відповідає не
 * текстом, а викликами запису другого раунду
 * (`apps/server/src/modules/chat/chatSecondRound.ts`, спека
 * `docs/work/specs/hubchat-second-tool-round.md`).
 */
import type { ChatRequestPayload, ChatResponse } from "@sergeant/api-client";
import { ApiError, chatApi } from "@shared/api";
import {
  CHAT_RESPONSE_TOO_LONG_TEXT,
  consumeHubChatSse,
  friendlyApiError,
} from "../../lib/hubChatUtils";

/**
 * Audit 03 F15 (perf): стеля накопиченого тексту відповіді на один стрім.
 * Далі відповідь на телефоні вже не читається, а кожна дельта перемальовує
 * весь список; контролер абортиться і хід показує «Відповідь занадто довга».
 */
export const MAX_STREAM_CHARS = 256 * 1024;

export type SynthesisOutcome =
  | { kind: "text"; text: string }
  /** Сервер обрав другий раунд: тіло у формі `tool_calls`-відповіді першого ходу. */
  | { kind: "tools"; data: ChatResponse };

export async function requestSynthesis(
  payload: ChatRequestPayload,
  opts: {
    signal: AbortSignal;
    /** Обриває контролер ходу, щоб читач стріму перестав тягнути кадри. */
    abort: () => void;
    /** Увесь накопичений текст відповіді на цей момент. */
    onText: (text: string) => void;
  },
): Promise<SynthesisOutcome> {
  const res = await chatApi.stream(payload, { signal: opts.signal });
  const ct = res.headers.get("content-type") || "";
  if (res.ok && ct.includes("text/event-stream")) {
    let acc = "";
    await consumeHubChatSse(res, (delta) => {
      if (acc.length + delta.length > MAX_STREAM_CHARS) {
        opts.abort();
        throw new Error(CHAT_RESPONSE_TOO_LONG_TEXT);
      }
      acc += delta;
      opts.onText(acc);
    });
    return { kind: "text", text: acc };
  }

  const raw = await res.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { error: raw };
  }
  const parsed = body as ChatResponse & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiError({
      kind: "http",
      message: friendlyApiError(res.status, parsed?.error, parsed?.code),
      status: res.status,
      body,
      bodyText: raw,
      url: res.url,
    });
  }
  if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
    return { kind: "tools", data: parsed };
  }
  const text = parsed.text || "";
  opts.onText(text);
  return { kind: "text", text };
}
