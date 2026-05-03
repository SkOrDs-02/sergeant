import { cn } from "@shared/lib/ui/cn";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { stopSpeaking, unlockTTS } from "../lib/hubChatSpeech";
import { useSpeech } from "../hooks/useSpeech";
import {
  useRef,
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

interface ChatInputProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  loading: boolean;
  online: boolean;
  speaking: boolean;
  setSpeaking: Dispatch<SetStateAction<boolean>>;
  onSend: () => void;
  onHelp: () => void;
  sendRef: MutableRefObject<
    ((text?: string, fromVoice?: boolean) => void) | null
  >;
  /**
   * Опційний callback ref для фокусу інпуту зовні (наприклад, після
   * prefill з ChatQuickActions). HubChat прив'язує сюди функцію, яка
   * потім викликає `.focus()`.
   */
  focusInputRef?: MutableRefObject<(() => void) | null>;
}

export function ChatInput({
  input,
  setInput,
  loading,
  online,
  speaking,
  setSpeaking,
  onSend,
  onHelp,
  sendRef,
  focusInputRef,
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Експозимо зовні лише метод `focus` — без разкривання самого DOM
  // вузла. Це дозволяє ChatQuickActions викликати focus() після
  // prefill, але не відкриває ChatInput для випадкового вживання.
  useEffect(() => {
    if (!focusInputRef) return;
    focusInputRef.current = () => inputRef.current?.focus();
    return () => {
      focusInputRef.current = null;
    };
  }, [focusInputRef]);

  // Автофокус лише на пристроях з «точним» вказівником — без спливаючої
  // клавіатури на телефонах (Web Interface Guidelines).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

  const {
    listening,
    toggle: rawToggleMic,
    supported: speechSupported,
  } = useSpeech((text) => {
    if (text.trim()) {
      sendRef.current?.(text.trim(), true);
    }
  });

  const toggleMic = useCallback(() => {
    unlockTTS();
    rawToggleMic();
  }, [rawToggleMic]);

  return (
    <div className="flex gap-2 px-4 pt-2 pb-4 shrink-0">
      <Tooltip content="Список команд (/help)" placement="top-center">
        <button
          type="button"
          onClick={onHelp}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-[background-color,border-color,color,opacity] border bg-panel border-line text-muted hover:text-text hover:border-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          aria-label="Показати список команд"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </Tooltip>
      <input
        ref={inputRef}
        className="input-focus-finyk flex-1 bg-panel border border-line rounded-2xl px-4 py-3 text-sm text-text placeholder:text-subtle disabled:opacity-50"
        placeholder={
          online
            ? "Запитай або попроси змінити щось…"
            : "Немає зʼєднання — асистент офлайн"
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) =>
          e.key === "Enter" && !e.shiftKey && online && onSend()
        }
        disabled={!online}
        aria-label="Повідомлення асистенту"
      />
      {speaking ? (
        <button
          type="button"
          onClick={() => {
            stopSpeaking();
            setSpeaking(false);
          }}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-[background-color,border-color,color,opacity] border bg-warning/15 border-warning text-warning motion-safe:animate-pulse focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          title="Зупинити озвучення"
          aria-label="Зупинити озвучення"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            aria-hidden
            focusable="false"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      ) : speechSupported ? (
        <button
          type="button"
          onClick={toggleMic}
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-[background-color,border-color,color,opacity] border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
            listening
              ? "bg-danger-strong text-white border-danger-strong motion-safe:animate-pulse"
              : "bg-panel border-line text-muted hover:text-text hover:border-muted",
          )}
          title={listening ? "Зупинити запис" : "Голосовий ввід"}
          aria-label={listening ? "Зупинити запис" : "Голосовий ввід"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={listening ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSend}
        disabled={loading || !input.trim() || !online}
        className="w-11 h-11 rounded-full bg-primary text-bg flex items-center justify-center shrink-0 hover:brightness-110 transition-[filter,opacity] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        aria-label={online ? "Надіслати" : "Надсилання недоступне офлайн"}
        title={online ? "Надіслати" : "Немає інтернету — асистент офлайн"}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable="false"
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </div>
  );
}
