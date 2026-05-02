import { useEffect, useRef } from "react";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/cn";
import type { InlineAiState } from "./useInlineAiRail";

export interface InlineAiRailProps {
  state: InlineAiState;
  /** Re-run the same prompt without leaving the launcher. */
  onRetry: (prompt: string) => void;
  /** Abort an in-flight request without dismissing the rail. */
  onCancel: () => void;
  /**
   * Escalate to the fullscreen chat surface. The launcher closes and
   * the chat opens with the prompt prefilled (no auto-send), so the
   * user can edit / continue multi-turn from where they left off.
   */
  onOpenInChat: (prompt: string) => void;
  /** Dismiss the rail without leaving the launcher. */
  onDismiss: () => void;
}

const STATUS_LABEL: Record<InlineAiState["status"], string> = {
  idle: "",
  loading: "AI шукає відповідь",
  success: "Відповідь асистента",
  aborted: "Запит скасовано",
  error: "Помилка асистента",
};

/**
 * Inline answer rail rendered under SearchInput when the user picks
 * the `ai-handoff` hit. Replaces the previous behaviour of opening
 * `HubChat` as a 92dvh overlay for what is most often a single-shot
 * Q&A.
 *
 * The rail purposefully does NOT execute tool_calls — mutations need
 * the chat surface's undo/confirm flow. When the model returns
 * tool_calls we surface the answer text (or a stub) plus an "Open in
 * chat" CTA that hands the prompt back to {@link HubChat}.
 */
export function InlineAiRail({
  state,
  onRetry,
  onCancel,
  onOpenInChat,
  onDismiss,
}: InlineAiRailProps) {
  // Pull the answer block into the focus ring once it lands so screen
  // readers announce it without the user having to navigate back. We
  // only auto-focus on success/error; loading/aborted are transient.
  const answerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.status === "success" || state.status === "error") {
      answerRef.current?.focus({ preventScroll: false });
    }
  }, [state.status]);

  if (state.status === "idle") return null;

  const { question } = state;

  return (
    <div
      className="px-3 sm:px-4 pt-2"
      role="region"
      aria-label="Inline-відповідь асистента"
    >
      <Card
        variant="default"
        radius="lg"
        padding="md"
        className="space-y-3"
        ref={answerRef as never}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                state.status === "error"
                  ? "bg-danger-soft text-danger-strong"
                  : "bg-brand-soft text-brand-strong dark:text-brand-300",
              )}
              aria-hidden="true"
            >
              <Icon
                name={state.status === "error" ? "alert-circle" : "sparkle"}
                size={16}
                strokeWidth={2.2}
              />
            </span>
            <div className="min-w-0">
              <SectionHeading as="p" size="sm" variant="muted">
                {STATUS_LABEL[state.status]}
              </SectionHeading>
              <div className="text-style-label text-text truncate">
                {question}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Закрити відповідь"
            className="shrink-0 -m-1 p-1 rounded-md text-muted hover:bg-panelHi hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon name="close" size={16} strokeWidth={2.2} />
          </button>
        </div>

        {state.status === "loading" && (
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex items-center gap-2 text-sm text-muted"
              aria-live="polite"
            >
              <span
                className="inline-block h-3 w-3 rounded-full border-2 border-brand-300 border-t-transparent animate-spin"
                aria-hidden="true"
              />
              <span>Думаю…</span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1"
            >
              Скасувати
            </button>
          </div>
        )}

        {state.status === "success" && (
          <>
            <p
              className="text-sm text-text whitespace-pre-wrap leading-relaxed"
              aria-live="polite"
            >
              {state.answer}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenInChat(state.question)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-style-label",
                  "bg-brand-soft text-brand-strong dark:text-brand-300",
                  "border border-brand-soft-border/50 hover:bg-brand-soft-hover",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                )}
              >
                <Icon name="sparkle" size={14} strokeWidth={2.2} />
                Відкрити в чаті
              </button>
              {state.hasToolCalls && (
                <span className="text-meta text-muted">
                  Дія потребує підтвердження в чаті
                </span>
              )}
              {state.truncated && !state.hasToolCalls && (
                <span className="text-meta text-muted">
                  Повна відповідь — у чаті
                </span>
              )}
              <button
                type="button"
                onClick={() => onRetry(state.question)}
                className="ml-auto text-sm text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1"
              >
                Спробувати ще раз
              </button>
            </div>
          </>
        )}

        {state.status === "aborted" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Запит скасовано — натисни «Запитати знову», щоб спробувати ще раз.
            </p>
            <button
              type="button"
              onClick={() => onRetry(state.question)}
              className="text-sm text-brand-strong dark:text-brand-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1"
            >
              Запитати знову
            </button>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-danger-strong dark:text-red-200">
              {state.message}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(state.question)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-style-label",
                  "bg-panel border border-line text-text hover:bg-panelHi",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                )}
              >
                <Icon name="refresh-cw" size={14} strokeWidth={2.2} />
                Повторити
              </button>
              <button
                type="button"
                onClick={() => onOpenInChat(state.question)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-style-label",
                  "bg-brand-soft text-brand-strong dark:text-brand-300",
                  "border border-brand-soft-border/50 hover:bg-brand-soft-hover",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                )}
              >
                <Icon name="sparkle" size={14} strokeWidth={2.2} />
                Відкрити в чаті
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
