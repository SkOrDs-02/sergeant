import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeApi } from "@shared/api";

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

export interface UseGroqVoiceInputOptions {
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

export interface UseGroqVoiceInputReturn {
  listening: boolean;
  uploading: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useGroqVoiceInput({
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
