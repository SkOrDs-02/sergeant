/**
 * @status Active
 * Стрім першого ходу HubChat (С-1 (а), рішення founder-а 2026-11-18, спека
 * `docs/work/specs/hubchat-first-turn-stream.md`). Винесено з
 * `useChatSend.ts`, бо той стоїть на межі `max-lines` (Hard Rule #18).
 *
 * - `requestFirstTurn` просить перший хід зі стрімом (`chatApi.firstTurn`):
 *   текст і кроки приходять колбеками, результат — у формі JSON-відповіді.
 *   Старий сервер відповідає JSON, і хід іде старим шляхом без помилки.
 * - `createStreamedReply` веде бульбашку, у якій текст зʼявляється, поки
 *   модель його пише; та сама бульбашка потім стає відповіддю або карткою.
 */
import type { SetStateAction } from "react";
import type { ChatRequestPayload, ChatResponse } from "@sergeant/api-client";
import { ApiError, chatApi, isApiError } from "@shared/api";
import {
  CHAT_RESPONSE_TOO_LONG_TEXT,
  friendlyApiError,
  newMsgId,
  type ChatMessage,
} from "../../lib/hubChatUtils";

/** Стеля накопиченого тексту, як у турі синтезу (`useChatSend.ts`). */
const MAX_FIRST_TURN_CHARS = 256 * 1024;

type WriteMessages = (updater: SetStateAction<ChatMessage[]>) => void;

export interface StreamedReply {
  /** Id бульбашки, щойно показано перший шматок тексту; інакше `null`. */
  readonly id: string | null;
  /** Показаний текст (вступ моделі перед інструментом або вся відповідь). */
  readonly text: string;
  onText: (delta: string) => void;
  /**
   * Ставить у стрічку остаточне повідомлення ходу: на місце бульбашки стріму
   * (зі збереженням її id), а без неї — новим рядком.
   */
  put: (message: ChatMessage) => void;
  /**
   * Обрив після видимого тексту (рішення founder-а): написане лишається, а
   * бульбашка отримує «Ще раз» з тим самим питанням. `false` — показаного
   * тексту немає або хід уже завершено, тож діє звичайна гілка помилки.
   */
  interrupt: (retryText: string) => boolean;
}

export function createStreamedReply(
  write: WriteMessages,
  onOverflow: () => void,
): StreamedReply {
  let id: string | null = null;
  let text = "";
  let settled = false;
  return {
    get id() {
      return id;
    },
    get text() {
      return text;
    },
    onText(delta) {
      if (settled || !delta) return;
      if (text.length + delta.length > MAX_FIRST_TURN_CHARS) {
        onOverflow();
        throw new Error(CHAT_RESPONSE_TOO_LONG_TEXT);
      }
      text += delta;
      if (id === null) {
        const bubbleId = newMsgId();
        id = bubbleId;
        write((m) => [...m, { id: bubbleId, role: "assistant", text }]);
        return;
      }
      const current = text;
      write((m) => m.map((x) => (x.id === id ? { ...x, text: current } : x)));
    },
    put(message) {
      settled = true;
      if (id === null) {
        write((m) => [...m, message]);
        return;
      }
      const replace = { ...message, id };
      write((m) => m.map((x) => (x.id === id ? replace : x)));
    },
    interrupt(retryText) {
      if (settled || id === null) return false;
      settled = true;
      write((m) =>
        m.map((x) =>
          x.id === id ? { ...x, interrupted: true, retryText } : x,
        ),
      );
      return true;
    },
  };
}

/** Обірвані відповіді не їдуть в історію: модель не дописує свій уривок. */
export function withoutInterrupted(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  return messages.filter((m) => m.interrupted !== true);
}

/**
 * Текст бульбашки ходу з інструментом: вступ моделі, потім рядок без картки.
 * Порожній рядок або текст із порожнім рядком у кінці (як `prefix` синтезу).
 */
export function toolTurnPrefix(preamble: string, uncardedText: string): string {
  const parts = [preamble.trim(), uncardedText].filter(Boolean);
  return parts.length > 0 ? `${parts.join("\n\n")}\n\n` : "";
}

/**
 * Перший хід: стрім, якщо сервер його вміє, інакше JSON. HTTP- і parse-помилки
 * переписуються на зрозумілий людині текст, як і раніше в `useChatSend`.
 */
export async function requestFirstTurn(
  payload: ChatRequestPayload,
  opts: {
    signal: AbortSignal;
    onText: (delta: string) => void;
    onTool: (name: string) => void;
  },
): Promise<ChatResponse> {
  try {
    return await chatApi.firstTurn(payload, opts);
  } catch (err) {
    // Rewrite `message` to user-friendly while staying inside `ApiError` —
    // the outer `friendlyChatError` should see the same error shape as every
    // other call site.
    if (isApiError(err) && err.kind === "http") {
      throw new ApiError({
        kind: "http",
        message: friendlyApiError(
          err.status,
          err.serverMessage,
          (err.body as { code?: string } | undefined)?.code,
        ),
        status: err.status,
        body: err.body,
        bodyText: err.bodyText,
        url: err.url,
        cause: err,
      });
    }
    if (isApiError(err) && err.kind === "parse") {
      throw new ApiError({
        kind: "parse",
        message: "Некоректна відповідь сервера",
        body: err.body,
        bodyText: err.bodyText,
        url: err.url,
        cause: err,
      });
    }
    throw err;
  }
}
