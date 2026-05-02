import { useState, useRef, useCallback } from "react";

type SpeechRecognitionResultLike = {
  readonly length: number;
  [index: number]: { readonly transcript: string } | undefined;
};

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// Web Speech API не входить у lib.dom — типи держимо локально і
// читаємо `window` через приватну window-shape без `declare global`,
// щоб не нав'язувати єдину сигнатуру іншим call-сайтам (наприклад,
// `VoiceMicButton.tsx` має власну сумісну форму, ширшу для тестів).
type WindowWithSpeech = typeof window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export interface UseSpeechResult {
  listening: boolean;
  toggle: () => void;
  supported: boolean;
}

export function useSpeech(
  onResult: (transcript: string) => void,
): UseSpeechResult {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  const supported =
    typeof window !== "undefined" &&
    !!(
      (window as WindowWithSpeech).SpeechRecognition ||
      (window as WindowWithSpeech).webkitSpeechRecognition
    );

  const toggle = useCallback(() => {
    if (!supported || typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.abort();
      setListening(false);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "uk-UA";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) cbRef.current(transcript);
    };
    rec.onerror = (e) => {
      console.warn("Speech error:", e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }, [listening, supported]);

  return { listening, toggle, supported };
}
