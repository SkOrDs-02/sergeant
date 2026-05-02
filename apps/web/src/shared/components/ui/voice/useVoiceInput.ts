import { useCallback, useEffect, useRef, useState } from "react";

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
