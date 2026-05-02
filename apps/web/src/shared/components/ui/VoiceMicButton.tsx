import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared/lib/cn";
import { hapticTap } from "@shared/lib/haptic";
import { transcribeApi } from "@shared/api";

/* -------------------------------------------------------------------------- *
 *  Web Speech API (browser-native) — fallback path.
 * -------------------------------------------------------------------------- */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult:
    | ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if ("SpeechRecognition" in window)
    return window.SpeechRecognition as SpeechRecognitionCtor;
  if ("webkitSpeechRecognition" in window)
    return window.webkitSpeechRecognition as SpeechRecognitionCtor;
  return undefined;
}

export interface UseVoiceInputOptions {
  lang?: string;
  onResult?: (transcript: string) => void;
  onError?: (message: string) => void;
}

export interface UseVoiceInputReturn {
  listening: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceInput({
  lang = "uk-UA",
  onResult,
  onError,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    setSupported(!!SpeechRecognition);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      onError?.("Голосовий ввід не підтримується у цьому браузері.");
      return;
    }
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* noop */
      }
      recRef.current = null;
    }
    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResult?.(transcript);
    };
    rec.onerror = (e) => {
      setListening(false);
      recRef.current = null;
      if (e.error === "not-allowed") {
        onError?.("Немає дозволу на використання мікрофону.");
      } else if (e.error === "no-speech") {
        onError?.("Не вдалося розпізнати мову. Спробуй ще раз.");
      } else if (e.error !== "aborted") {
        onError?.(`Помилка розпізнавання: ${e.error}`);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
      recRef.current = null;
    }
  }, [lang, onResult, onError]);

  const stop = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return { listening, supported, start, stop, toggle };
}

/* -------------------------------------------------------------------------- *
 *  Groq Whisper — server-side STT через `/api/transcribe`.
 * -------------------------------------------------------------------------- */

const GROQ_MAX_DURATION_MS = 60_000; // hard cap, щоб не палити квоту випадково
const GROQ_MIN_DURATION_MS = 250; // менше — майже завжди мовчання

/**
 * Підбирає `audio/*` MIME-тип, який підтримує MediaRecorder у поточному
 * браузері. Порядок важливий: WebM/Opus — універсал на Chrome/Android,
 * MP4/AAC — єдина опція на iOS Safari ≥ 14.5.
 */
function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* deno/jsdom no-op */
    }
  }
  return "";
}

function isGroqSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === "undefined") return false;
  if (typeof FormData === "undefined") return false;
  return pickRecorderMimeType() !== null;
}

interface UseGroqVoiceInputOptions {
  lang?: string;
  promptHint?: string;
  onResult?: (transcript: string) => void;
  onError?: (message: string) => void;
  /**
   * Викликається при 503 від `/api/transcribe` (ключ Groq не сконфігурований).
   * Викликача треба переключитися на Web Speech API для решти сесії.
   */
  onProviderUnavailable?: () => void;
}

interface UseGroqVoiceInputReturn {
  listening: boolean;
  uploading: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

function useGroqVoiceInput({
  lang = "uk-UA",
  promptHint,
  onResult,
  onError,
  onProviderUnavailable,
}: UseGroqVoiceInputOptions = {}): UseGroqVoiceInputReturn {
  const [listening, setListening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupported(isGroqSupported());
  }, []);

  const cleanup = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (streamRef.current) {
      try {
        for (const t of streamRef.current.getTracks()) t.stop();
      } catch {
        /* noop */
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const upload = useCallback(
    async (blob: Blob, mimeType: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setUploading(true);
      try {
        // Whisper бере 2-літерний ISO-код (`uk-UA` → `uk`).
        const isoLang = lang.split("-")[0]?.trim();
        const query: { language?: string; prompt?: string } = {};
        if (isoLang) query.language = isoLang;
        if (promptHint && promptHint.trim()) {
          query.prompt = promptHint.trim().slice(0, 1024);
        }
        const result = await transcribeApi.send(
          { audio: blob, mimeType },
          query,
          { signal: controller.signal },
        );
        switch (result.outcome) {
          case "ok": {
            const text = result.data.text.trim();
            if (text) onResult?.(text);
            else onError?.("Не вдалося розпізнати мову. Спробуй ще раз.");
            return;
          }
          case "provider_unavailable":
            onProviderUnavailable?.();
            onError?.(
              "Голосовий сервер тимчасово недоступний — перемикаюсь на браузерне розпізнавання.",
            );
            return;
          case "unauthorized":
            onError?.(
              "Сесія завершилась. Увійди знову, щоб користуватись голосом.",
            );
            return;
          case "rate_limited":
            onError?.("Забагато голосових запитів — спробуйте за хвилину.");
            return;
          case "payload_too_large":
            onError?.("Запис задовгий. Зроби коротшим і повтори.");
            return;
          case "unsupported_media_type":
            onError?.("Браузер записав невідомий формат. Оновись і повтори.");
            return;
          case "error":
            onError?.(
              `Помилка розпізнавання (${result.status}). Спробуй ще раз.`,
            );
            return;
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if ((err as { kind?: string })?.kind === "aborted") return;
        onError?.("Не вдалося надіслати аудіо. Перевір інтернет.");
      } finally {
        setUploading(false);
        abortRef.current = null;
      }
    },
    [lang, promptHint, onResult, onError, onProviderUnavailable],
  );

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    try {
      rec.stop();
    } catch {
      /* fall through; cleanup триггерить onstop */
    }
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || uploading) return;
    const mimeType = pickRecorderMimeType();
    if (mimeType === null) {
      onError?.("Браузер не підтримує запис аудіо.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError?.("Немає дозволу на використання мікрофону.");
      } else if (name === "NotFoundError") {
        onError?.("Мікрофон не знайдено.");
      } else {
        onError?.("Не вдалося отримати доступ до мікрофону.");
      }
      return;
    }
    streamRef.current = stream;

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    recorder.addEventListener("dataavailable", (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    });
    recorder.addEventListener("start", () => setListening(true));
    recorder.addEventListener("stop", () => {
      setListening(false);
      const duration = Date.now() - startedAtRef.current;
      const finalMime = recorder.mimeType || mimeType || "audio/webm";
      const chunks = chunksRef.current;
      cleanup();
      if (chunks.length === 0) return;
      if (duration < GROQ_MIN_DURATION_MS) {
        onError?.(
          "Запис занадто короткий — затисніть і говоріть кілька секунд.",
        );
        return;
      }
      const blob = new Blob(chunks, { type: finalMime });
      void upload(blob, finalMime);
    });
    recorder.addEventListener("error", () => {
      onError?.("Помилка запису аудіо.");
      cleanup();
      setListening(false);
    });

    try {
      recorder.start();
      stopTimerRef.current = setTimeout(() => {
        stop();
      }, GROQ_MAX_DURATION_MS);
    } catch {
      onError?.("Не вдалося почати запис.");
      cleanup();
      setListening(false);
    }
  }, [uploading, onError, cleanup, upload, stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch {
        /* noop */
      }
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      cleanup();
    };
  }, [cleanup]);

  return { listening, uploading, supported, start, stop, toggle };
}

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

/* -------------------------------------------------------------------------- *
 *  Confirm chip — 3-сек preview/undo після успішного STT.
 * -------------------------------------------------------------------------- */

const VOICE_CONFIRM_MS = 3000;
const CHIP_WIDTH = 288;
const CHIP_VIEWPORT_MARGIN = 8;
// Висота чипа динамічна (1–2 рядки тексту), але для розрахунку «вгору vs
// вниз» нам достатньо консервативної оцінки: один рядок ≈ 56px,
// два рядки ≈ 72px. Беремо більшу — краще трохи зайнятого простору
// зверху, ніж чип, який вилазить за нижній край в'юпорта.
const CHIP_HEIGHT_ESTIMATE = 72;

interface PendingVoiceChipProps {
  text: string;
  anchorRect: DOMRect;
  onConfirm: () => void;
  onCancel: () => void;
}

function PendingVoiceChip({
  text,
  anchorRect,
  onConfirm,
  onCancel,
}: PendingVoiceChipProps) {
  const [progress, setProgress] = useState(1);
  const startedAtRef = useRef<number>(Date.now());
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    startedAtRef.current = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, VOICE_CONFIRM_MS - elapsed);
      setProgress(remaining / VOICE_CONFIRM_MS);
      if (remaining <= 0) {
        onConfirmRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape — швидкий вихід без збереження. Особливо важливо на десктопі,
  // де керування з клавіатури дешевше за тач-цілі.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Позиціонування фіксоване відносно в'юпорта: пробуємо знизу від
  // кнопки; якщо не вліз — піднімаємо вгору. Горизонтально центруємо
  // по кнопці, але клампимо у в'юпорт.
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const spaceBelow = vh - anchorRect.bottom;
  const placeAbove = spaceBelow < CHIP_HEIGHT_ESTIMATE + CHIP_VIEWPORT_MARGIN;
  const top = placeAbove
    ? Math.max(
        CHIP_VIEWPORT_MARGIN,
        anchorRect.top - CHIP_HEIGHT_ESTIMATE - CHIP_VIEWPORT_MARGIN,
      )
    : Math.min(
        vh - CHIP_HEIGHT_ESTIMATE - CHIP_VIEWPORT_MARGIN,
        anchorRect.bottom + CHIP_VIEWPORT_MARGIN,
      );
  const rawLeft = anchorRect.left + anchorRect.width / 2 - CHIP_WIDTH / 2;
  const left = Math.max(
    CHIP_VIEWPORT_MARGIN,
    Math.min(vw - CHIP_WIDTH - CHIP_VIEWPORT_MARGIN, rawLeft),
  );

  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const secondsLeft = Math.ceil(progress * (VOICE_CONFIRM_MS / 1000));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Підтвердження голосового вводу"
      style={{
        position: "fixed",
        top,
        left,
        width: CHIP_WIDTH,
        zIndex: 9999,
      }}
      className="rounded-2xl bg-panel/95 backdrop-blur-sm border border-line shadow-xl px-3 py-2 flex items-center gap-2 motion-safe:animate-fade-in"
    >
      {/* Countdown ring + remaining seconds.  Ring fills counter-clockwise
          so the visual "drains" toward zero. */}
      <div className="relative w-7 h-7 shrink-0" aria-hidden>
        <svg viewBox="0 0 24 24" className="w-7 h-7 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-line"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-brand"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - progress),
              transition: "stroke-dashoffset 80ms linear",
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-micro font-semibold text-text tabular-nums">
          {secondsLeft}
        </span>
      </div>

      {/* Tapping the transcript = "save now". The button is the largest
          touch target in the chip on purpose — the most likely action is
          "looks right, just commit it without waiting". */}
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onConfirm();
        }}
        className="flex-1 min-w-0 text-left text-xs leading-tight text-text hover:text-brand-strong line-clamp-2"
        title="Зберегти зараз"
      >
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
        <span className="block text-micro uppercase tracking-wide text-subtle">
          Голос
        </span>
        <span className="block">{text}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          hapticTap();
          onCancel();
        }}
        className="shrink-0 w-7 h-7 rounded-full bg-line/30 text-muted hover:text-error hover:bg-error/15 flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        aria-label="Скасувати"
        title="Скасувати"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

type Provider = "auto" | "groq" | "webspeech";

function resolveConfiguredProvider(): Provider {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_VOICE_PROVIDER
      ? String(import.meta.env.VITE_VOICE_PROVIDER)
          .trim()
          .toLowerCase()
      : "";
  if (raw === "groq" || raw === "webspeech" || raw === "auto") return raw;
  return "auto";
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
    sm: "w-8 h-8 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]",
    md: "w-10 h-10 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]",
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
