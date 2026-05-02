import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, chatApi, isApiError } from "@shared/api";
import { buildContextMeasured } from "../../lib/hubChatContext";
import { friendlyApiError, friendlyChatError } from "../../lib/hubChatUtils";

/**
 * Single-shot AI request used by the launcher's inline answer rail.
 *
 * Unlike `useChatSend`, the rail keeps state local (no session
 * persistence, no multi-turn history) and never executes tool_calls
 * — mutations require the chat surface's undo flow, so when the
 * model responds with tool_calls we surface a "Open in chat" CTA
 * instead of mutating data behind the user's back.
 *
 * The rail trims long answers to {@link MAX_INLINE_REPLY_LEN} chars
 * with a `truncated: true` flag so the UI can show "Read more" /
 * "Open in chat" without dumping a 4-screen wall into the launcher.
 */

const MAX_INLINE_REPLY_LEN = 600;

export type InlineAiState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "success";
      question: string;
      answer: string;
      hasToolCalls: boolean;
      truncated: boolean;
    }
  | { status: "aborted"; question: string }
  | { status: "error"; question: string; message: string };

export interface UseInlineAiRailResult {
  state: InlineAiState;
  /** Trigger a fresh request, aborting any in-flight one. */
  ask: (question: string) => Promise<void>;
  /** Reset to idle (also aborts in-flight). */
  reset: () => void;
  /** Abort the in-flight request without resetting state. */
  cancel: () => void;
}

export function useInlineAiRail(): UseInlineAiRailResult {
  const [state, setState] = useState<InlineAiState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  // Abort any pending request when the rail unmounts (launcher closes
  // mid-stream). Without this, the fetch keeps burning tokens in the
  // background after the user has moved on.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setState({ status: "loading", question: trimmed });

    const context = buildContextMeasured();

    try {
      const data = await chatApi.send(
        {
          context,
          messages: [{ role: "user", content: trimmed }],
        },
        { signal: ac.signal },
      );

      const toolCallCount = Array.isArray(data.tool_calls)
        ? data.tool_calls.length
        : 0;
      const reply = (data.text || "").trim();
      const hasToolCalls = toolCallCount > 0;
      const baseAnswer = reply
        ? reply
        : hasToolCalls
          ? "Знайшов дію — для виконання потрібен повноцінний чат."
          : "Немає відповіді.";
      const truncated = baseAnswer.length > MAX_INLINE_REPLY_LEN;
      const answer = truncated
        ? `${baseAnswer.slice(0, MAX_INLINE_REPLY_LEN).trimEnd()}…`
        : baseAnswer;

      setState({
        status: "success",
        question: trimmed,
        answer,
        hasToolCalls,
        truncated,
      });
    } catch (err) {
      // Explicit cancel (rail close / new ask) — keep the question on
      // screen but surface a quiet "aborted" badge instead of an error.
      if (isApiError(err) && err.kind === "aborted") {
        setState({ status: "aborted", question: trimmed });
        return;
      }
      if ((err as { name?: string } | null)?.name === "AbortError") {
        setState({ status: "aborted", question: trimmed });
        return;
      }

      let msg: string;
      if (err instanceof ApiError && err.kind === "http") {
        msg = friendlyApiError(err.status, err.serverMessage);
      } else {
        msg = friendlyChatError(err);
      }
      setState({ status: "error", question: trimmed, message: msg });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, []);

  return { state, ask, reset, cancel };
}
