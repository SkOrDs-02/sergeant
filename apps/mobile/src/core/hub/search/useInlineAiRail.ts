/**
 * Single-shot AI request used by the launcher's inline answer rail
 * (mobile mirror of `apps/web/src/core/hub/search/useInlineAiRail.ts`).
 *
 * Mobile differences from web:
 *  - Uses `useApiClient()` from `@sergeant/api-client/react` instead of
 *    the web `chatApi` singleton — the mobile API client wires
 *    SecureStore-backed bearer auth.
 *  - The rail does NOT inject a `context` blob: the web's
 *    `buildContextMeasured()` reads `localStorage` Hub state that
 *    isn't mirrored to the mobile op-log yet (Phase 3 of the RN
 *    migration plan). The user-facing prompt is sent as-is and the
 *    server falls back to its default empty-context path. When
 *    mobile HubChat ships, we'll lift `buildContextMeasured` into a
 *    storage-agnostic helper and wire it here.
 *  - Never executes tool_calls — mutations need the chat surface's
 *    undo/confirm flow. When the model returns tool_calls we surface
 *    the answer text (or a stub) plus an "Open in chat" CTA.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, isApiError } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";

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

function friendlyApiError(
  status: number,
  serverMessage?: string | null,
): string {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403)
    return "Потрібно увійти, щоб запитати асистента.";
  if (status === 429) return "Забагато запитів — спробуй за хвилину.";
  if (status >= 500) return "Сервер тимчасово недоступний. Спробуй пізніше.";
  return `Помилка ${status}.`;
}

function friendlyChatError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Не вдалося отримати відповідь.";
}

export function useInlineAiRail(): UseInlineAiRailResult {
  const api = useApiClient();
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

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setState({ status: "loading", question: trimmed });

      try {
        const data = await api.chat.send(
          {
            // Mobile context plumbing lands in Phase 3 of the RN
            // migration plan — server tolerates empty `context`.
            context: "",
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
    },
    [api],
  );

  return { state, ask, reset, cancel };
}
