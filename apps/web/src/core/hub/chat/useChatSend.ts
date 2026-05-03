import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, chatApi, isApiError } from "@shared/api";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import {
  CONTEXT_TTL_MS,
  cancelIdle,
  consumeHubChatSse,
  friendlyApiError,
  friendlyChatError,
  getActiveModule,
  isHelpCommand,
  makeAssistantMsg,
  makeUserMsg,
  newMsgId,
  requestIdle,
  type ActiveModule,
} from "../../lib/hubChatUtils";
import { buildContextMeasured } from "../../lib/hubChatContext";
import { executeActions } from "../../lib/hubChatActions";
import { VOICE_KEYWORDS, speak } from "../../lib/hubChatSpeech";
import { buildActionCard } from "../../lib/hubChatActionCards";
import type { ChatActionCard } from "../../lib/hubChatActionCards";
import { useFinykHubPreview } from "../useFinykHubPreview";
import type { HubChatSession } from "../hubChatSessions";

type ChatMessage = HubChatSession["messages"][number];

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
  speaking: boolean;
  setSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  online: boolean;
  hasData: boolean;
  contextState: { status: string; ts: number };
  activeModule: ActiveModule | null;
  /** Send `text` (or the current `input`). `fromVoice` flag triggers TTS reply. */
  send: (text?: string, fromVoice?: boolean) => Promise<void>;
  /** Abort the in-flight request (cancel button or close while streaming). */
  cancelInFlight: () => void;
  /** Imperative send ref — used by the autofocus / quick-action handlers. */
  sendRef: React.MutableRefObject<
    ((text?: string, fromVoice?: boolean) => Promise<void>) | null
  >;
  /** Imperative focus ref — passed to ChatInput so quick actions can refocus. */
  focusInputRef: React.MutableRefObject<(() => void) | null>;
}

/**
 * Owns the send pipeline for HubChat: input/loading/speaking state,
 * the cached chat context, the online indicator, and the `send`
 * function itself. Keeps the abort-controller lifecycle (cancel
 * button, unmount during stream) and the TTS hand-off.
 *
 * The Finyk preview cache is observed here so the chat context is
 * rebuilt whenever Mono syncs / disconnects (driven by RQ
 * invalidation of `hubKeys.preview("finyk")`), and tool-call results
 * also invalidate the same query so subsequent streams see the
 * up-to-date snapshot.
 */
export function useChatSend({
  messages,
  setMessages,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
}: UseChatSendOptions): UseChatSendResult {
  const toast = useToast();
  const queryClient = useQueryClient();
  const finykPreview = useFinykHubPreview();
  const hasData = finykPreview.data?.hasMonoData ?? false;
  const online = useOnlineStatus();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // AbortController for cancelling the active request (cancel button).
  // Lives in a ref because it does not affect render — we just need a
  // way to interrupt `chatApi.send`/`stream` and immediately return
  // the UI to ready (loading=false).
  const abortRef = useRef<AbortController | null>(null);
  const lastWasVoice = useRef(false);

  // Context cache.
  const contextRef = useRef({ text: "", ts: 0 });
  const [contextState, setContextState] = useState({ status: "idle", ts: 0 });
  const idleJobRef = useRef<ReturnType<typeof requestIdle> | null>(null);

  const scheduleContextBuild = useCallback((reason = "auto", force = false) => {
    const now = Date.now();
    if (
      !force &&
      contextRef.current.text &&
      now - contextRef.current.ts < CONTEXT_TTL_MS
    ) {
      setContextState((s) =>
        s.status === "ready"
          ? s
          : { status: "ready", ts: contextRef.current.ts },
      );
      return;
    }
    if (idleJobRef.current) cancelIdle(idleJobRef.current);
    setContextState({ status: "building", ts: contextRef.current.ts || 0 });
    idleJobRef.current = requestIdle(() => {
      idleJobRef.current = null;
      const m = perfMark(`hubchat:contextBuild(${reason})`);
      const text = buildContextMeasured();
      contextRef.current = { text, ts: Date.now() };
      perfEnd(m, { len: text?.length || 0 });
      setContextState({ status: "ready", ts: contextRef.current.ts });
    });
  }, []);

  useEffect(() => {
    scheduleContextBuild("mount", true);
    return () => {
      if (idleJobRef.current) cancelIdle(idleJobRef.current);
    };
  }, [scheduleContextBuild]);

  // Rebuild context whenever the Finyk preview snapshot flips
  // (Monobank sync, clear-cache, disconnect, or a cross-tab storage
  // event). Driven by RQ invalidation of `hubKeys.preview("finyk")`.
  const finykPreviewUpdatedAt = finykPreview.dataUpdatedAt;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    scheduleContextBuild("finyk-cache", true);
  }, [finykPreviewUpdatedAt, scheduleContextBuild]);

  const activeModule = useMemo(() => getActiveModule(), []);

  // TTS speaking state poll.
  useEffect(() => {
    if (!speaking) return;
    const id = setInterval(() => {
      if (!window.speechSynthesis?.speaking) setSpeaking(false);
    }, 300);
    return () => clearInterval(id);
  }, [speaking]);

  const sendRef = useRef<
    ((text?: string, fromVoice?: boolean) => Promise<void>) | null
  >(null);
  // Callback ref into ChatInput's `.focus()` — used after prefill from
  // ChatQuickActions so focus lands on the input immediately.
  const focusInputRef = useRef<(() => void) | null>(null);

  const maybeSpeak = useCallback((text: string) => {
    speak(text);
    setSpeaking(true);
  }, []);

  const send = useCallback(
    async (text?: string, fromVoice = false) => {
      const msg = (text || input).trim();
      if (!msg || loading) return;

      if (isHelpCommand(msg)) {
        // /help no longer renders a wall of markdown — it now opens
        // the catalogue page so the user can browse and tap
        // capabilities.
        setInput("");
        if (onOpenCatalogue) {
          onOpenCatalogue();
        }
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

      const shouldSpeak =
        fromVoice || lastWasVoice.current || VOICE_KEYWORDS.test(msg);
      lastWasVoice.current = false;

      const userMsg = makeUserMsg(msg);
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setLoading(true);

      const history = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      // Fresh AbortController per send. If a previous one is still
      // alive (shouldn't be — `send` guards on `loading`) we abort it
      // for safety. Signal is forwarded into chatApi.send / stream.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      try {
        const context = contextRef.current.text || buildContextMeasured();
        if (!contextRef.current.text) {
          contextRef.current = { text: context, ts: Date.now() };
          setContextState({ status: "ready", ts: contextRef.current.ts });
        }

        let data;
        try {
          data = await chatApi.send({ context, messages: history }, { signal });
        } catch (err) {
          // Rewrite `message` to user-friendly while staying inside
          // `ApiError` — the outer `friendlyChatError` should see the
          // same error shape as every other call site.
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
          // Cast tool_calls to ChatAction[] — the API guarantees the
          // name+id+input shape.
          type ToolCall = {
            id: string;
            name: string;
            input: Record<string, unknown>;
          };
          const toolCalls = data.tool_calls as ToolCall[];
          const handlerResults = await executeActions(
            toolCalls as Parameters<typeof executeActions>[0],
          );
          const toolResults = toolCalls.map((tc, idx) => ({
            tool_use_id: tc.id,
            content: handlerResults[idx]?.result ?? "",
          }));

          // Mutator handlers (`create_transaction`, `mark_habit_done`,
          // `log_meal`, `create_habit`, …) return `{ undo }` alongside
          // the textual result. Show the standard 5-second undo toast
          // for each — `showUndoToast` returns its own timer
          // (overlap-stack is acceptable: one tool-call covers 99 %
          // of turns; in the rare 2-3 simultaneous mutations case the
          // user sees one toast per change). Read-only handlers
          // (search, totals, summaries) have no `undo` so no toast.
          for (const hr of handlerResults) {
            if (hr.undo) {
              const undoFn = hr.undo;
              showUndoToast(toast, {
                msg: hr.result,
                onUndo: undoFn,
              });
            }
          }

          const actionsText = toolResults
            .map((r) => `✅ ${r.content}`)
            .join("\n");
          const prefix = `${actionsText}\n\n`;

          // Build action cards for known tools. Unknown tool → null,
          // text-only fallback.
          const cards: ChatActionCard[] = toolCalls
            .map((tc, idx) =>
              buildActionCard({
                name: tc.name as string,
                input: tc.input as Record<string, unknown>,
                result: toolResults[idx]?.content || "",
              }),
            )
            .filter((c): c is ChatActionCard => c !== null);

          const assistantId = newMsgId();
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
            const res2 = await chatApi.stream(
              {
                context: contextRef.current.text || context,
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
              let data2 = {};
              try {
                data2 = raw2 ? JSON.parse(raw2) : {};
              } catch {
                data2 = { error: raw2 };
              }
              const parsed = data2 as { error?: string; text?: string };
              if (!res2.ok)
                throw new ApiError({
                  kind: "http",
                  message: friendlyApiError(res2.status, parsed?.error),
                  status: res2.status,
                  body: data2,
                  bodyText: raw2,
                  url: res2.url,
                });
              followUpText = parsed.text || "";
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

          if (shouldSpeak) {
            const speakTarget = followUpText || actionsText;
            if (speakTarget) maybeSpeak(speakTarget);
          }

          queryClient.invalidateQueries({
            queryKey: hubKeys.preview("finyk"),
          });
          scheduleContextBuild("after-tools", true);
        } else {
          const reply = data.text || "Немає відповіді.";
          setMessages((m) => [...m, makeAssistantMsg(reply)]);
          if (shouldSpeak) maybeSpeak(reply);
        }
      } catch (e) {
        // Explicit cancel (cancel button or chat close) shouldn't
        // surface as an error — drop a quiet marker.
        if (isApiError(e) && e.kind === "aborted") {
          setMessages((m) => [...m, makeAssistantMsg("⏹ Запит скасовано.")]);
        } else if ((e as { name?: string } | null)?.name === "AbortError") {
          setMessages((m) => [...m, makeAssistantMsg("⏹ Запит скасовано.")]);
        } else {
          setMessages((m) => [...m, makeAssistantMsg(friendlyChatError(e))]);
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setLoading(false);
      }
    },
    [
      input,
      loading,
      messages,
      online,
      onOpenCatalogue,
      maybeSpeak,
      queryClient,
      scheduleContextBuild,
      setMessages,
      toast,
    ],
  );

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Cancel the in-flight request if the chat is closed mid-stream —
  // otherwise fetch keeps "burning" tokens in the background and the
  // finally handler runs after unmount (console noise + potential
  // race).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  sendRef.current = send;

  // Initial-message handling — kick off the very first send if
  // `autoSendInitial`, otherwise prefill the input.
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
    speaking,
    setSpeaking,
    online,
    hasData,
    contextState,
    activeModule,
    send,
    cancelInFlight,
    sendRef,
    focusInputRef,
  };
}
