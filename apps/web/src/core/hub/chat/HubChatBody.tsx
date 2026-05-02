import { useEffect, useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { ChatMessage, TypingIndicator } from "../../components/ChatMessage";
import type { HubChatSession } from "../hubChatSessions";

type ChatMessageEntry = HubChatSession["messages"][number];

export interface HubChatBodyProps {
  messages: ChatMessageEntry[];
  loading: boolean;
  /** Notified when a message bubble starts TTS playback. */
  onSpeak: () => void;
  /** Cancel the in-flight chat request — wired to the inline cancel pill. */
  onCancel: () => void;
}

/**
 * Scrollable message list + inline cancel pill while a request is
 * in flight. Auto-scrolls to bottom on every new message and on the
 * `loading` flip so the typing indicator (and the cancel pill next
 * to it) stay visible.
 */
export function HubChatBody({
  messages,
  loading,
  onSpeak,
  onCancel,
}: HubChatBodyProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  return (
    <div
      ref={chatRef}
      className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 min-h-0"
      aria-live="polite"
      aria-relevant="additions"
    >
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
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-panelHi hover:bg-line/40 text-muted hover:text-text text-2xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
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
