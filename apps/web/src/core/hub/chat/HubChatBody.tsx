/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { ChatMessage, TypingIndicator } from "../../components/ChatMessage";
import type { HubChatSession } from "../hubChatSessions";
import { ChatEmpty } from "./ChatEmpty";

type ChatMessageEntry = HubChatSession["messages"][number];

export interface HubChatBodyProps {
  messages: ChatMessageEntry[];
  loading: boolean;
  /** Notified when a message bubble starts TTS playback. */
  onSpeak: () => void;
  /** Cancel the in-flight chat request — wired to the inline cancel pill. */
  onCancel: () => void;
  /**
   * PR-26: викликається при тапі на suggestion-chip у `<ChatEmpty>`.
   * Parent (HubChat) пробрасує `setInput` + setTimeout-focus, як це
   * робить `<ChatQuickActions onPrefill>` у composer-і.
   */
  onPickSuggestion: (text: string) => void;
}

/**
 * Scrollable message list + inline cancel pill while a request is
 * in flight. Auto-scrolls to bottom on new messages / on the `loading`
 * flip **only when the user is already stuck near the bottom** — once
 * they scroll up more than `STICK_THRESHOLD_PX` to re-read history,
 * streamed deltas no longer yank the view back (F12). Sending a new
 * user message re-sticks (signal: user just sent → wants to see reply).
 *
 * Якщо `messages.length === 0` — рендерить `<ChatEmpty>` як
 * empty-state-placeholder з 4 chip-suggestion-ами, що префілять
 * composer (PR-26 / §A12).
 */
const STICK_THRESHOLD_PX = 32;

export function HubChatBody({
  messages,
  loading,
  onSpeak,
  onCancel,
  onPickSuggestion,
}: HubChatBodyProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const lastRole = messages[messages.length - 1]?.role;
  // Re-stick the moment the user sends a new message — they want the reply.
  if (lastRole === "user") stickToBottomRef.current = true;

  useEffect(() => {
    if (chatRef.current && stickToBottomRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  const handleScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollTop + el.clientHeight >= el.scrollHeight - STICK_THRESHOLD_PX;
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div
      ref={chatRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 min-h-0"
      aria-busy={loading}
      aria-live="polite"
      aria-relevant="additions"
    >
      {/* Visually-hidden live region for streaming status — announced to
          screen readers without disrupting the message list region above. */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {loading ? "Асистент відповідає…" : ""}
      </span>
      {isEmpty && <ChatEmpty onPickSuggestion={onPickSuggestion} />}
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} onSpeak={onSpeak} />
      ))}
      {loading && (
        <div className="flex items-center gap-2">
          <TypingIndicator />
          <Tooltip content="Скасувати (Esc)" placement="top-center">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 rounded-full bg-panelHi hover:bg-line/40 text-muted hover:text-text text-style-caption font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
              aria-label="Скасувати поточний запит"
            >
              <Icon name="close" size={12} />
              Скасувати
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
