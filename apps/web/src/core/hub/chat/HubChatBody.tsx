/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { ChatMessage, TypingIndicator } from "../../components/ChatMessage";
import type { HubChatSession } from "../hubChatSessions";
// Аліас: проп цього компонента теж зветься `messages` (стрічка повідомлень).
import { messages as uiCopy } from "@shared/i18n/uk";

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
 * in flight. Auto-scrolls to bottom on new messages / on the `loading`
 * flip **only when the user is already stuck near the bottom** — once
 * they scroll up more than `STICK_THRESHOLD_PX` to re-read history,
 * streamed deltas no longer yank the view back (F12). Sending a new
 * user message re-sticks (signal: user just sent → wants to see reply).
 */
const STICK_THRESHOLD_PX = 32;

export function HubChatBody({
  messages,
  loading,
  onSpeak,
  onCancel,
}: HubChatBodyProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  // Re-stick the moment the user sends a new message — they want the reply.
  useEffect(() => {
    const lastRole = messages[messages.length - 1]?.role;
    if (lastRole === "user") stickToBottomRef.current = true;
  }, [messages]);

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

  // Текст останньої завершеної відповіді асистента — рівно те, що треба
  // прочитати вголос після того, як стрім завершився.
  const last = messages[messages.length - 1];
  const announcedReply =
    !loading && last && last.role === "assistant" && last.error !== true
      ? last.text
      : "";

  return (
    <div
      ref={chatRef}
      onScroll={handleScroll}
      // `overscroll-none`: `HubChatOverlay` overrides Sheet's own
      // `bodyClassName` (`!overflow-hidden`), so THIS is the actual
      // scrollable element for the chat — `-contain` alone still let the
      // browser paint its own rubber-band glow at this element's edge
      // (round-2 UI audit X2).
      // `tabIndex={0}`: прокручувана стрічка мусить бути досяжна з
      // клавіатури (axe `scrollable-region-focusable`, WCAG 2.1.1), інакше
      // без миші історію чату не прогорнути, коли в ній немає фокусованих
      // елементів (порожній чат або лише текстові відповіді). Правило
      // jsx-a11y нижче цього випадку не розрізняє: прокручуваний контейнер
      // з tabIndex — рекомендований axe спосіб, не інтерактивний «фейк».
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="flex-1 overflow-y-auto overscroll-none touch-pan-y px-4 py-3 space-y-3 min-h-0 focus-ring"
      aria-busy={loading}
    >
      {/* Visually-hidden live region for streaming status — announced to
          screen readers without disrupting the message list region above.

          AI-DANGER: тут оголошується і САМА ВІДПОВІДЬ, не лише статус. Доти
          область казала тільки «Сержант відповідає…», а стрічка повідомлень
          лежить у статичному `role="region"` (`HubChat.tsx`), тож незрячий
          користувач чув, що асистент відповідає, і не чув ЩО (browser-QA
          2026-09-02).

          Оголошуємо на завершенні (`!loading`), а не під час стріму: жива
          область на самій стрічці перечитувала б відповідь на кожен чанк.
          Помилки сюди не потрапляють — у них власний `role="alert"` на
          бульбашці. */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {loading ? "Сержант відповідає…" : announcedReply}
      </span>
      {/*
        AI-DANGER: розкриття «це AI» (EU AI Act ст. 50(1), чинна з 2026-08-02)
        мусить стояти ТУТ, над стрічкою, і БЕЗУМОВНО.

        Доти воно жило в порожньому стані чату, а `normalizeStoredMessages`
        (`core/lib/hubChatUtils.ts`) підставляла привітальну репліку щоразу,
        коли збережений масив порожній, тож порожній стан не рендерився
        ніколи, і обовʼязкове розкриття не показувалось жодного разу
        (browser-QA 2026-09-02). Рядок видно з першого кадру незалежно від
        того, чи є повідомлення. Прибираєш звідси або вішаєш на умову —
        повертаєш порушення.
      */}
      <p className="text-style-caption text-subtle leading-snug text-pretty text-center px-2">
        {uiCopy.hub.chatEmptyAiDisclosure}
      </p>
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
              <Icon name="close" size="xs" />
              Скасувати
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
