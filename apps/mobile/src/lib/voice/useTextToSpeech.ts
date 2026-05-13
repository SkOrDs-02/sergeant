/**
 * Text-to-Speech на mobile (Phase 8). Обгортка над `expo-speech`
 * з:
 *
 *  - Persistent mute-флагом (через MMKV-storage із `@/lib/storage`),
 *    щоб юзер міг назавжди заглушити TTS у composer-і чату.
 *  - UA-default-локаллю (`uk-UA`).
 *  - Безпечним queueing-ом (нативний `Speech.speak` сам queue-ить
 *    нові utterance-и поверх поточної).
 *
 * Web-аналог TTS на Sergeant поки не існує: web-композер мовчить.
 * Ми лишаємо `useTextToSpeech` сумісним з ідеєю "speak + mute toggle",
 * щоб коли HubChat на mobile залендиться — він просто інстансував
 * хук без додаткової логіки.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import * as Speech from "expo-speech";

import { mobileKVStore } from "@/lib/storage";

const MUTE_STORAGE_KEY = "sergeant.voice.tts.muted";

export interface UseTextToSpeechOptions {
  /** BCP-47 локаль, дефолт `uk-UA`. */
  lang?: string;
  /** Pitch — `1.0` нормальний. */
  pitch?: number;
  /** Rate — `1.0` нормальний. */
  rate?: number;
}

export interface UseTextToSpeechReturn {
  /**
   * Озвучити текст. NoOp коли `muted=true` або текст порожній.
   * Якщо вже щось говориться — нативний engine queue-ить нове.
   */
  speak: (text: string) => void;
  /** Зупинити негайно і скинути чергу. */
  stop: () => void;
  /** Зараз йде озвучення (між onStart і onDone/onStopped). */
  speaking: boolean;
  /** Persistent mute — зберігається у MMKV між запусками апи. */
  muted: boolean;
  /** Перемикач mute (зберігає у MMKV). */
  toggleMute: () => void;
  /** Експліцитно виставити mute (зберігає у MMKV). */
  setMuted: (next: boolean) => void;
}

function readInitialMuted(): boolean {
  try {
    return mobileKVStore.getString(MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useTextToSpeech({
  lang = "uk-UA",
  pitch,
  rate,
}: UseTextToSpeechOptions = {}): UseTextToSpeechReturn {
  const [muted, setMutedState] = useState<boolean>(() => readInitialMuted());
  const [speaking, setSpeaking] = useState(false);

  // Snapshot опцій у ref, щоб `speak()` ловив свіжі значення без зміни
  // identity-callback-а.
  const optionsRef = useRef({ lang, pitch, rate });
  optionsRef.current = { lang, pitch, rate };

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    try {
      mobileKVStore.setString(MUTE_STORAGE_KEY, next ? "true" : "false");
    } catch {
      /* noop — MMKV може бути недоступний у тестах */
    }
    if (next) {
      // Якщо муьтимо посеред озвучення — зупиняємо одразу.
      try {
        void Speech.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  const speak = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (muted) return;
      const { lang: l, pitch: p, rate: r } = optionsRef.current;
      try {
        Speech.speak(trimmed, {
          language: l,
          ...(p !== undefined ? { pitch: p } : {}),
          ...(r !== undefined ? { rate: r } : {}),
          onStart: () => setSpeaking(true),
          onDone: () => setSpeaking(false),
          onStopped: () => setSpeaking(false),
          onError: () => setSpeaking(false),
        });
      } catch {
        setSpeaking(false);
      }
    },
    [muted],
  );

  const stop = useCallback(() => {
    try {
      void Speech.stop();
    } catch {
      /* noop */
    }
    setSpeaking(false);
  }, []);

  // На unmount — гарантовано зупиняємо engine, щоб не залишити голос
  // після того як юзер уже закрив екран.
  useEffect(() => {
    return () => {
      try {
        void Speech.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { speak, stop, speaking, muted, toggleMute, setMuted };
}
