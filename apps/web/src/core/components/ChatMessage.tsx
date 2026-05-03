import { memo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { AssistantMessageBody } from "./AssistantMessageBody";
import { speak } from "../lib/hubChatSpeech";
import type { ChatMessage as ChatMessageData } from "../lib/hubChatUtils";
import type { ChatActionCard } from "../lib/hubChatActionCards";

interface ChatMessageProps {
  message: ChatMessageData;
  onSpeak?: () => void;
}

/**
 * RiskyBadge — small inline chip shown on destructive action cards.
 */
function RiskyBadge() {
  return (
    <span className="shrink-0 inline-flex items-center gap-0.5 text-2xs font-semibold text-warning rounded-full bg-warning/15 px-1.5 py-0.5">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Критична дія
    </span>
  );
}

/**
 * ActionCard — summarises a completed tool call.
 * Long summaries are clamped to 2 lines and expand on demand.
 * Risky (destructive) cards get a warning border + RiskyBadge.
 */
function ActionCard({ card }: { card: ChatActionCard }) {
  const [expanded, setExpanded] = useState(false);
  const failed = card.status === "failed";
  const isRisky = !failed && card.risky;

  return (
    <div
      data-testid={`chat-action-card-${card.toolName}`}
      role="status"
      aria-label={`${card.title}: ${card.summary}`}
      className={cn(
        "mt-2 flex items-start gap-2 rounded-xl border px-3 py-2",
        failed
          ? "bg-warning/10 border-warning/30"
          : isRisky
            ? "bg-warning/5 border-warning/40"
            : "bg-brand-500/5 border-brand-500/30",
      )}
    >
      <span
        className={cn(
          "shrink-0 mt-0.5",
          failed ? "text-warning" : isRisky ? "text-warning" : "text-brand-500",
        )}
        aria-hidden
      >
        <Icon name={card.icon || (failed ? "alert" : "check")} size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-text">
          <span className="truncate">{card.title}</span>
          {isRisky && <RiskyBadge />}
        </div>

        {card.summary && (
          <>
            <div
              className={cn(
                "text-2xs text-subtle mt-0.5 break-words",
                !expanded && "line-clamp-2",
              )}
            >
              {card.summary}
            </div>
            {card.summary.length > 120 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-2xs text-brand-500 hover:text-brand-600 mt-0.5 transition-colors"
              >
                {expanded ? "Згорнути" : "Показати все"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * ConfirmCard — rendered inline in an assistant message when the AI
 * executed (or wants to confirm) a destructive action.
 * v1: post-action confirmation notice with visual emphasis.
 * Differs from ActionCard: full-width layout, danger colour scheme,
 * and a distinct icon that signals irreversibility.
 */
function ConfirmCard({ card }: { card: ChatActionCard }) {
  return (
    <div
      data-testid={`chat-confirm-card-${card.toolName}`}
      role="status"
      aria-label={`Виконано: ${card.title}`}
      className="mt-2 rounded-xl border border-danger/30 bg-danger/5 overflow-hidden"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-danger/20">
        <span className="shrink-0 text-danger" aria-hidden>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </span>
        <span className="text-xs font-semibold text-danger flex-1 truncate">
          {card.title}
        </span>
        <span className="shrink-0 text-2xs font-semibold text-danger/70 rounded-full bg-danger/10 px-1.5 py-0.5">
          Виконано
        </span>
      </div>
      {/* Summary */}
      {card.summary && (
        <p className="px-3 py-2 text-2xs text-subtle leading-relaxed break-words">
          {card.summary}
        </p>
      )}
    </div>
  );
}

function ChatMessageImpl({ message, onSpeak }: ChatMessageProps) {
  const { role, text, cards } = message;
  const isAssistant = role === "assistant";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isAssistant ? "flex-row" : "flex-row-reverse",
      )}
    >
      {isAssistant && (
        <span
          className="shrink-0 mb-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-brand-500"
          aria-hidden
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="5" r="1" />
          </svg>
        </span>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isAssistant
            ? "bg-panel border border-line text-text rounded-bl-sm whitespace-normal"
            : "bg-primary text-bg rounded-br-sm whitespace-pre-wrap",
        )}
      >
        {isAssistant ? <AssistantMessageBody text={text} /> : text}
        {isAssistant &&
          cards &&
          cards.length > 0 &&
          cards.map((c) =>
            c.risky && c.status === "completed" ? (
              <ConfirmCard key={c.id} card={c} />
            ) : (
              <ActionCard key={c.id} card={c} />
            ),
          )}
        {isAssistant && text && text.length > 3 && (
          <button
            type="button"
            onClick={() => {
              speak(text);
              onSpeak?.();
            }}
            className="mt-1.5 flex items-center gap-1 text-xs text-subtle hover:text-text transition-colors"
            title="Озвучити"
            aria-label="Озвучити відповідь"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
            Озвучити
          </button>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageImpl);

export function TypingIndicator() {
  return (
    <div
      className="flex items-end gap-2"
      role="status"
      aria-label="Асистент набирає відповідь"
    >
      <span
        className="shrink-0 mb-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-brand-500"
        aria-hidden
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="5" r="1" />
        </svg>
      </span>
      <div
        aria-hidden
        className="bg-panel border border-line rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center"
      >
        {[0, 0.15, 0.3].map((d, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-subtle rounded-full motion-safe:animate-bounce"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
    </div>
  );
}
