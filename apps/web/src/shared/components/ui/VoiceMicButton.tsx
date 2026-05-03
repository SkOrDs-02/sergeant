import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { PendingVoiceChip } from "./voice/PendingVoiceChip";
import { resolveConfiguredProvider } from "./voice/resolveVoiceProvider";
import { useGroqVoiceInput } from "./voice/useGroqVoiceInput";
import { useVoiceInput } from "./voice/useVoiceInput";

export {
  useVoiceInput,
  type UseVoiceInputOptions,
  type UseVoiceInputReturn,
} from "./voice/useVoiceInput";

/* -------------------------------------------------------------------------- *
 *  Public component.
 * -------------------------------------------------------------------------- */

export type VoiceMicButtonSize = "sm" | "md" | "lg";

export interface VoiceMicButtonProps {
  onResult?: (transcript: string) => void;
  onError?: (message: string) => void;
  lang?: string;
  className?: string;
  size?: VoiceMicButtonSize;
  label?: string;
  disabled?: boolean;
  /**
   * Доменна підказка для Whisper (≤ 1024 символи). Приклади:
   *   - Fizruk: список останніх вправ ("жим штанги, присід, тяга, ...").
   *   - Nutrition: типові продукти ("гречка, яйце, ...").
   *   - Finyk: категорії витрат ("кафе, продукти, транспорт, ...").
   * Покращує точність на спеціалізованій лексиці на 15–25%. Ігнорується
   * у Web Speech-fallback.
   */
  promptHint?: string;
  /**
   * Якщо `true` (за замовчуванням), після успішного розпізнавання
   * показуємо preview-чипі з 3-секундним таймером авто-підтвердження
   * (à la Gmail Undo Send). Користувач може:
   *   - тапнути по тексту → застосувати миттєво,
   *   - натиснути ✕ → скасувати без застосування,
   *   - не робити нічого → авто-застосувати через 3 секунди.
   * Це рятує від «голос почув не те» — найгірший сценарій, коли
   * розпізнаний текст одразу зберігається у форму без шансу на правку.
   *
   * Передавайте `false` тільки коли upstream сам показує миттєвий
   * preview (наприклад, чат, де voice-повідомлення спершу попадає у
   * draft, а юзер бачить його і може правити).
   */
  confirmBeforeCommit?: boolean;
}

export function VoiceMicButton({
  onResult,
  onError,
  lang = "uk-UA",
  className,
  size = "md",
  label,
  disabled = false,
  promptHint,
  confirmBeforeCommit = true,
}: VoiceMicButtonProps) {
  // Sticky-fallback на Web Speech, якщо `/api/transcribe` повернув 503.
  // Тримаємо у state, щоб не спамити upstream і не плутати юзера між
  // двома провайдерами в межах однієї сесії.
  const [forceFallback, setForceFallback] = useState(false);

  // `pending` — це останній transcript, що чекає на підтвердження.
  // Anchor-rect знімаємо разом з ним, бо чип позиціонується ВІДНОСНО
  // кнопки, але рендериться у portal (фіксоване розташування у в'юпорті
  // живе своїм життям незалежно від overflow:hidden обгорток форм).
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState<{
    text: string;
    anchorRect: DOMRect;
  } | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Інтерсептор: замість миттєвого commit показуємо preview-чипі.
  // Якщо `confirmBeforeCommit=false` — поведінка стара (миттєвий
  // commit, як до UX-3), щоб чат і подібні call-сайти лишались
  // незмінні.
  const handleTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!confirmBeforeCommit) {
        onResultRef.current?.(trimmed);
        return;
      }
      const rect =
        buttonRef.current?.getBoundingClientRect() ??
        // Fallback — кнопка ще не змонтована (теоретично неможливо тут,
        // бо event прилетіти може лише після click). На всякий випадок —
        // центр в'юпорта.
        new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
      setPending({ text: trimmed, anchorRect: rect });
    },
    [confirmBeforeCommit],
  );

  const groq = useGroqVoiceInput({
    lang,
    promptHint,
    onResult: handleTranscript,
    onError,
    onProviderUnavailable: () => setForceFallback(true),
  });
  const webspeech = useVoiceInput({
    lang,
    onResult: handleTranscript,
    onError,
  });

  const configured = resolveConfiguredProvider();
  // Якщо явно вибрано webspeech — ігноруємо Groq повністю.
  // Якщо явно вибрано groq і він не підтримується — фолбек на webspeech
  // (інакше юзер бачить кнопку, що нічого не робить).
  const useGroq =
    !forceFallback &&
    (configured === "groq" || configured === "auto") &&
    groq.supported;

  const active = useGroq ? groq : webspeech;

  const confirmPending = useCallback(() => {
    setPending((curr) => {
      if (curr) onResultRef.current?.(curr.text);
      return null;
    });
  }, []);
  const cancelPending = useCallback(() => {
    setPending(null);
  }, []);

  // Якщо компонент анмаунтається з активним pending — мовчки скидаємо
  // (НЕ комітимо). Інше було б сюрпризом: user закрив форму, а текст
  // "доставився" по таймеру.
  useEffect(() => {
    return () => {
      setPending(null);
    };
  }, []);

  if (!active.supported) return null;

  const isUploading = useGroq ? groq.uploading : false;
  const listening = active.listening;
  const busy = listening || isUploading;

  const sizeMap: Record<VoiceMicButtonSize, string> = {
    // sm/md visual size stays compact; coarse-pointer min 44×44 is applied below.
    sm: "w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
    md: "w-10 h-10 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
    lg: "w-12 h-12",
  };
  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;

  const handleClick = () => {
    hapticTap();
    // Натиснули кнопку, поки висить pending — це явний сигнал
    // "перезапиши". Скасуємо чип і одразу почнемо новий цикл, бо інакше
    // буде гонитва: timer auto-commit-не старий рядок а рекордер
    // одночасно почне новий запис.
    if (pending) {
      setPending(null);
    }
    active.toggle();
  };

  const ariaLabel = listening
    ? "Зупинити запис"
    : isUploading
      ? "Розпізнаю…"
      : label || "Голосовий ввід";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={disabled || isUploading}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          "relative flex items-center justify-center rounded-2xl shrink-0 touch-manipulation",
          "motion-safe:transition-all motion-reduce:transition-none",
          sizeMap[size] || sizeMap.md,
          busy
            ? "bg-error/15 text-error border border-error/30 motion-safe:animate-pulse"
            : "bg-panelHi text-muted hover:text-text hover:bg-line/40 border border-line",
          (disabled || isUploading) && "opacity-40 pointer-events-none",
          className,
        )}
      >
        {listening ? (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : isUploading ? (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="motion-safe:animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
      {pending && (
        <PendingVoiceChip
          text={pending.text}
          anchorRect={pending.anchorRect}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}
    </>
  );
}
