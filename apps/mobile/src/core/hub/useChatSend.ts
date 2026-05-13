/**
 * Mobile-side send pipeline для HubChat.
 *
 * Slim port `apps/web/src/core/hub/chat/useChatSend.ts`:
 *  - Викликає той самий `/api/chat` ендпоінт через `@sergeant/api-client`
 *    (`api.chat.send` + `api.chat.stream`) — контракт ідентичний web.
 *  - Online-статус приходить з NetInfo (web версія дивиться на
 *    `navigator.onLine`).
 *  - Hub-context (фінанси, тренування, звички, харчування) на mobile
 *    поки що порожній: web budgeт читає `window.localStorage`-блоби, які
 *    мобільна апка не дублює один-в-один. Сервер сам fall-back-нить на
 *    generic-instructions у такому разі. Повний context-builder — TODO
 *    Phase 8 react-native-migration.md.
 *  - Tool-call executor на mobile не запускається (handler-и читають
 *    web-only localStorage shape-и). Натомість картки будуються через
 *    `buildActionCard` і вертаються до сервера як заглушка
 *    «not supported on mobile», щоб follow-up stream завершився.
 *  - TTS (window.speechSynthesis) і `expo-speech` — окрема ініціатива
 *    (#7 / Phase 8); тут — text-only composer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { ApiError, isApiError } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";

import {
  consumeHubChatSse,
  friendlyApiError,
  friendlyChatError,
  isHelpCommand,
  makeAssistantMsg,
  makeUserMsg,
  newMsgId,
  type ChatMessage,
} from "./hubChatUtils";
import { buildActionCard, type ChatActionCard } from "./hubChatActionCards";

const REQUEST_TIMEOUT_MS = 90_000;

export interface UseChatSendOptions {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  initialMessage?: string;
  autoSendInitial?: boolean;
  onOpenCatalogue?: () => void;
}

export interface UseChatSendResult {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  online: boolean;
  send: (text?: string) => Promise<void>;
  cancelInFlight: () => void;
  sendRef: React.MutableRefObject<((text?: string) => Promise<void>) | null>;
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const apply = (state: NetInfoState): void => {
      const reachable =
        state.isInternetReachable === null
          ? state.isConnected !== false
          : state.isInternetReachable !== false && state.isConnected !== false;
      setOnline(reachable);
    };
    const unsub = NetInfo.addEventListener(apply);
    NetInfo.fetch()
      .then(apply)
      .catch(() => {
        /* netinfo undefined in tests — keep optimistic */
      });
    return () => unsub();
  }, []);
  return online;
}

export function useChatSend({
  messages,
  setMessages,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
}: UseChatSendOptions): UseChatSendResult {
  const api = useApiClient();
  const online = useOnlineStatus();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const sendRef = useRef<((text?: string) => Promise<void>) | null>(null);

  const send = useCallback(
    async (text?: string): Promise<void> => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;

      if (isHelpCommand(msg)) {
        setInput("");
        if (onOpenCatalogue) onOpenCatalogue();
        return;
      }

      if (!online) {
        setMessages((m) => [
          ...m,
          makeUserMsg(msg),
          makeAssistantMsg(
            "⚠️ Немає підключення. Асистент працює лише онлайн — спробуй ще раз, коли з'явиться інтернет.",
          ),
        ]);
        setInput("");
        return;
      }

      const userMsg = makeUserMsg(msg);
      const nextMsgs = [...messages, userMsg];
      setMessages(nextMsgs);
      setInput("");
      setLoading(true);

      const history = nextMsgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        // Mobile hub-context — TODO Phase 8. На сервері порожній рядок
        // обробляється як «без даних» — це не блокує assistant-турн.
        const context = "";

        let data;
        try {
          data = await api.chat.send(
            { context, messages: history },
            { signal },
          );
        } catch (err) {
          if (isApiError(err) && err.kind === "http") {
            throw new ApiError({
              kind: "http",
              message: friendlyApiError(err.status, err.serverMessage),
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

        if (data.tool_calls && data.tool_calls.length > 0) {
          interface ToolCall {
            id: string;
            name: string;
            input: Record<string, unknown>;
          }
          // The OpenAPI type for `tool_calls` widens entries beyond
          // what executors actually receive. Narrow defensively rather
          // than double-cast — server contract guarantees `id` + `name`.
          const toolCalls: ToolCall[] = data.tool_calls.flatMap((raw) => {
            const r = raw as Record<string, unknown>;
            const id = typeof r["id"] === "string" ? r["id"] : null;
            const name = typeof r["name"] === "string" ? r["name"] : null;
            if (!id || !name) return [];
            const rawInput = r["input"];
            const input: Record<string, unknown> =
              rawInput && typeof rawInput === "object"
                ? (rawInput as Record<string, unknown>)
                : {};
            return [{ id, name, input }];
          });

          // Mobile не виконує tool-handler-и локально — підставляємо
          // заглушку «not yet supported» так, щоб сервер міг завершити
          // турн. Користувач все одно побачить картку для кожного
          // tool-call-у.
          const stubResultText =
            "(tool execution не підтримана на мобільному клієнті — дія виконається у web)";
          const toolResults = toolCalls.map((tc) => ({
            tool_use_id: tc.id,
            content: stubResultText,
          }));

          const cards: ChatActionCard[] = toolCalls
            .map((tc) =>
              buildActionCard({
                name: tc.name,
                input: tc.input,
                result: stubResultText,
              }),
            )
            .filter((c): c is ChatActionCard => c !== null);

          const assistantId = newMsgId();
          const prefix =
            toolCalls.map((tc) => `✅ ${tc.name}`).join("\n") + "\n\n";
          setMessages((m) => [
            ...m,
            {
              id: assistantId,
              role: "assistant",
              text: prefix,
              ...(cards.length > 0 ? { cards } : {}),
            },
          ]);

          let followUpText = "";
          try {
            const res2 = await api.chat.stream(
              {
                context,
                messages: history,
                tool_results: toolResults,
                tool_calls_raw: data.tool_calls_raw,
                stream: true,
              },
              { signal },
            );
            const ct = res2.headers.get("content-type") || "";
            if (res2.ok && ct.includes("text/event-stream")) {
              let acc = "";
              await consumeHubChatSse(res2, (delta) => {
                acc += delta;
                setMessages((m) =>
                  m.map((x) =>
                    x.id === assistantId ? { ...x, text: prefix + acc } : x,
                  ),
                );
              });
              followUpText = acc;
            } else {
              const raw2 = await res2.text();
              let parsed: { error?: string; text?: string } = {};
              try {
                parsed = raw2 ? JSON.parse(raw2) : {};
              } catch {
                parsed = { error: raw2 };
              }
              if (!res2.ok) {
                throw new ApiError({
                  kind: "http",
                  message: friendlyApiError(res2.status, parsed.error),
                  status: res2.status,
                  body: parsed,
                  bodyText: raw2,
                  url: res2.url,
                });
              }
              followUpText = parsed.text ?? "";
              setMessages((m) =>
                m.map((x) =>
                  x.id === assistantId
                    ? { ...x, text: prefix + followUpText }
                    : x,
                ),
              );
            }
          } catch (e2) {
            setMessages((m) =>
              m.map((x) =>
                x.id === assistantId
                  ? { ...x, text: `${prefix}\n\n${friendlyChatError(e2)}` }
                  : x,
              ),
            );
          }
        } else {
          const reply = data.text || "Немає відповіді.";
          setMessages((m) => [...m, makeAssistantMsg(reply)]);
        }
      } catch (e) {
        const isAbort =
          (isApiError(e) && e.kind === "aborted") ||
          (e as { name?: string } | null)?.name === "AbortError";
        if (isAbort && timedOut) {
          setMessages((m) => [
            ...m,
            makeAssistantMsg("⏱ Час очікування вичерпано. Спробуй ще раз."),
          ]);
        } else if (isAbort) {
          setMessages((m) => [...m, makeAssistantMsg("⏹ Запит скасовано.")]);
        } else {
          setMessages((m) => [...m, makeAssistantMsg(friendlyChatError(e))]);
        }
      } finally {
        clearTimeout(timeoutId);
        if (abortRef.current === ac) abortRef.current = null;
        setLoading(false);
      }
    },
    [api, input, loading, messages, online, onOpenCatalogue, setMessages],
  );

  sendRef.current = send;

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Cancel in-flight on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Initial-message handling.
  useEffect(() => {
    if (!initialMessage) return;
    if (autoSendInitial) {
      sendRef.current?.(initialMessage);
    } else {
      setInput(initialMessage);
    }
  }, [initialMessage, autoSendInitial]);

  return {
    input,
    setInput,
    loading,
    online,
    send,
    cancelInFlight,
    sendRef,
  };
}
