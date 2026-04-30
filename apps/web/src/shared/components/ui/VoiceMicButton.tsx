import { useCallback, useEffect, useRef, useState } from "react";
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
}: VoiceMicButtonProps) {
  // Sticky-fallback на Web Speech, якщо `/api/transcribe` повернув 503.
  // Тримаємо у state, щоб не спамити upstream і не плутати юзера між
  // двома провайдерами в межах однієї сесії.
  const [forceFallback, setForceFallback] = useState(false);

  const groq = useGroqVoiceInput({
    lang,
    promptHint,
    onResult,
    onError,
    onProviderUnavailable: () => setForceFallback(true),
  });
  const webspeech = useVoiceInput({ lang, onResult, onError });

  const configured = resolveConfiguredProvider();
  // Якщо явно вибрано webspeech — ігноруємо Groq повністю.
  // Якщо явно вибрано groq і він не підтримується — фолбек на webspeech
  // (інакше юзер бачить кнопку, що нічого не робить).
  const useGroq =
    !forceFallback &&
    (configured === "groq" || configured === "auto") &&
    groq.supported;

  const active = useGroq ? groq : webspeech;
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
    active.toggle();
  };

  const ariaLabel = listening
    ? "Зупинити запис"
    : isUploading
      ? "Розпізнаю…"
      : label || "Голосовий ввід";

  return (
    <button
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
  );
}
