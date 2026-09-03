/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { AssistantMessageBody } from "@shared/components/AssistantMessageBody";
import { speak } from "../lib/hubChatSpeech";
import type { ChatMessage as ChatMessageData } from "../lib/hubChatUtils";
import type {
  ChatActionCard,
  ChatActionCardModule,
} from "../lib/hubChatActionCards";
import { DataResultCard } from "../hub/chat/components/DataResultCard";

interface ChatMessageProps {
  message: ChatMessageData;
  onSpeak?: () => void;
}

/**
 * Куди веде картка + як підписано її модуль.
 *
 * WHY. До цього `card.module` на вебі не читав ніхто: картка була суто
 * інформаційною, і всі успішні виклики виглядали однаково — рамка кодує
 * статус (виконано / помилка / деструктивна дія), а не тему. Мобільний
 * клієнт із того самого поля вже будував deep link
 * (`hubChatActionCards.ts` → `deepLinkForCard`), тож асиметрія була
 * недоглядом, а не рішенням.
 *
 * `hub` тут навмисно відсутній: кросмодульні tool-и ведуть у хаб, а чат
 * уже в хабі — посилання «сюди ж» лише додає шуму.
 *
 * Класи чіпа статичні (а не `bg-${module}-soft`), бо Tailwind збирає
 * класи текстовим скануванням і динамічне імʼя до білда не потрапляє.
 * Ті самі пари вживає `MODULE_COLORS` у hub-пошуку.
 */
const MODULE_LINK: Partial<
  Record<ChatActionCardModule, { to: string; label: string; chip: string }>
> = {
  finyk: {
    to: "/finyk",
    label: "Фінік",
    chip: "bg-finyk-soft text-finyk-soft-fg",
  },
  fizruk: {
    to: "/fizruk",
    label: "Фізрук",
    chip: "bg-fizruk-soft text-fizruk-soft-fg",
  },
  routine: {
    to: "/routine",
    label: "Рутина",
    chip: "bg-routine-soft text-routine-soft-fg",
  },
  nutrition: {
    to: "/nutrition",
    label: "Харчування",
    chip: "bg-nutrition-soft text-nutrition-soft-fg",
  },
};

/**
 * Посилання «відкрити модуль» під карткою.
 *
 * Окремим елементом, а не кліком по всій картці: `ActionCard` уже містить
 * кнопку «Показати все», і вкладена інтерактивність зламала б і клавіатуру,
 * і скрін-рідер.
 */
function ModuleLink({ module }: { module: ChatActionCardModule }) {
  const target = MODULE_LINK[module];
  if (!target) return null;
  return (
    <Link
      to={target.to}
      data-testid={`chat-card-link-${module}`}
      className={cn(
        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-style-caption font-medium transition-opacity hover:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        target.chip,
      )}
    >
      {target.label}
      <Icon name="chevron-right" size={12} />
    </Link>
  );
}

/**
 * ActionCard — summarises a completed tool call.
 * Long summaries are clamped to 2 lines and expand on demand.
 *
 * AI-NOTE: гілки для `risky` тут немає навмисно. `ChatMessage` віддає
 * risky-картку у `ConfirmCard`, щойно статус `completed`, а risky+failed
 * потрапляє під failed-стиль — тобто «risky, але ще не виконано» станом
 * не існує. Попередня версія малювала для нього окремий бейдж і рамку
 * `warning/40`, які не могли відрендеритись жодного разу.
 */
function ActionCard({ card }: { card: ChatActionCard }) {
  const [expanded, setExpanded] = useState(false);
  const failed = card.status === "failed";

  return (
    <div
      data-testid={`chat-action-card-${card.toolName}`}
      role="status"
      aria-label={`${card.title}: ${card.summary}`}
      className={cn(
        "mt-2 flex items-start gap-2 rounded-xl border px-3 py-2",
        failed
          ? "bg-warning/10 border-warning/30"
          : "bg-brand-500/5 border-brand-500/30",
      )}
    >
      <span
        className={cn(
          "shrink-0 mt-0.5",
          failed ? "text-warning" : "text-brand-500",
        )}
        aria-hidden
      >
        <Icon name={card.icon || (failed ? "alert" : "check")} size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap text-style-label font-semibold text-text">
          <span className="truncate">{card.title}</span>
        </div>

        {card.summary && (
          <>
            <div
              className={cn(
                "text-style-caption text-subtle mt-0.5 wrap-break-word",
                !expanded && "line-clamp-2",
              )}
            >
              {card.summary}
            </div>
            {card.summary.length > 120 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-style-caption text-brand-strong hover:text-brand-600 mt-0.5 transition-colors"
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
        <span className="text-style-label font-semibold text-danger-strong dark:text-danger flex-1 truncate">
          {card.title}
        </span>
        <span className="shrink-0 text-style-caption font-semibold text-danger-strong dark:text-danger rounded-full bg-danger/10 px-1.5 py-0.5">
          Виконано
        </span>
      </div>
      {/* Summary */}
      {card.summary && (
        <p className="px-3 py-2 text-style-caption text-subtle leading-relaxed wrap-break-word">
          {card.summary}
        </p>
      )}
    </div>
  );
}

function ChatMessageImpl({ message, onSpeak }: ChatMessageProps) {
  const { role, text, cards } = message;
  const isAssistant = role === "assistant";
  // Збій — не відповідь моделі. Своя заливка й `role="alert"`, щоб його не
  // читали як репліку асистента, і без TTS: озвучувати текст помилки нема сенсу.
  const isError = message.error === true;

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
        {...(isError ? { role: "alert" as const } : {})}
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-style-body leading-relaxed",
          isAssistant && isError
            ? "bg-danger/10 border border-danger/30 text-text rounded-bl-sm whitespace-normal"
            : isAssistant
              ? "bg-panel border border-line text-text rounded-bl-sm whitespace-normal"
              : "bg-primary text-bg rounded-br-sm whitespace-pre-wrap",
        )}
      >
        {isAssistant ? <AssistantMessageBody text={text} /> : text}
        {isAssistant &&
          cards &&
          cards.length > 0 &&
          cards.map((c) => (
            <div key={c.id}>
              {c.data ? (
                <DataResultCard
                  toolName={c.toolName}
                  result={c.summary}
                  failed={c.status === "failed"}
                  title={c.title}
                />
              ) : c.risky && c.status === "completed" ? (
                <ConfirmCard card={c} />
              ) : (
                <ActionCard card={c} />
              )}
              <ModuleLink module={c.module} />
            </div>
          ))}
        {isAssistant && !isError && text && text.length > 3 && (
          <button
            type="button"
            onClick={() => {
              speak(text);
              onSpeak?.();
            }}
            className="mt-1.5 flex items-center gap-1 text-style-label text-subtle hover:text-text transition-colors"
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
      {/* Animated dots — hidden when prefers-reduced-motion is active. */}
      <div
        aria-hidden
        className="motion-safe:flex hidden bg-panel border border-line rounded-2xl rounded-bl-sm px-4 py-3 gap-1.5 items-center"
      >
        {[0, 0.15, 0.3].map((d, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-subtle rounded-full motion-safe:animate-bounce"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
      {/* Static label shown only when prefers-reduced-motion is set. */}
      <div
        aria-hidden
        className="motion-reduce:flex motion-safe:hidden bg-panel border border-line rounded-2xl rounded-bl-sm px-4 py-3 items-center"
      >
        <span className="text-style-body text-muted">Думаю…</span>
      </div>
    </div>
  );
}
