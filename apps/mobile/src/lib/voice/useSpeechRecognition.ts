/**
 * RN port of web's `useVoiceInput` (Phase 8 — `docs/mobile/react-native-migration.md` §6.5).
 *
 * Тримаємо публічний API сумісним з web-варіантом
 * (`apps/web/src/shared/components/ui/voice/useVoiceInput.ts`):
 *
 *   `{ listening, supported, start, stop, toggle }`
 *
 * Під капотом — native STT через `expo-speech-recognition`
 * (iOS `SFSpeechRecognizer` / Android `SpeechRecognizer`). Якщо
 * розпізнавач у системі не доступний (наприклад, simulator без
 * Speech-services або emulator без Google quick-search), `supported`
 * лишається `false` і `start()` мовчки no-op-ить (onError кличеться
 * текстом, що пояснює юзеру причину).
 *
 * Дозволи запитуються лазі — лише коли юзер фактично тапає мікрофон.
 * Декланьоване дозволу = `not-allowed` error → onError-toast.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addSpeechRecognitionListener,
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

export interface UseSpeechRecognitionOptions {
  /** BCP-47 локаль, дефолт `uk-UA` — Sergeant UA-first. */
  lang?: string;
  /**
   * Викликається з фіналним розпізнаним текстом (не з interim-ами).
   * Web-аналог стріляє onResult саме на final, тому тут так само.
   */
  onResult?: (transcript: string) => void;
  /** UA-text помилки, готовий до показу юзеру у toast. */
  onError?: (message: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Зараз йде запис голосу і чекаємо розпізнавання. */
  listening: boolean;
  /**
   * На цьому пристрої доступне native розпізнавання
   * (`ExpoSpeechRecognitionModule.isRecognitionAvailable()`).
   * `false` — наприклад, на iOS simulator-і без Speech-services
   * або на Android emulator-і без Google quick-search.
   */
  supported: boolean;
  /** Стартує сесію (запитує permission якщо ще не питав). */
  start: () => void;
  /** Зупиняє сесію (final result доставляється onResult). */
  stop: () => void;
  /** Toggle — стандартний для mic-icon-кнопок. */
  toggle: () => void;
}

/** UA-переклад нативних error-кодів у user-facing toast. */
function describeError(code: string, fallback: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Немає дозволу на використання мікрофону.";
  }
  if (code === "no-speech" || code === "speech-timeout") {
    return "Не вдалося розпізнати мову. Спробуй ще раз.";
  }
  if (code === "network") {
    return "Немає інтернету для розпізнавання мовлення.";
  }
  if (code === "language-not-supported") {
    return "Ця мова не підтримується розпізнавачем на пристрої.";
  }
  if (code === "busy") {
    return "Розпізнавач зайнятий. Спробуй ще раз.";
  }
  if (code === "aborted") return "";
  return fallback || `Помилка розпізнавання: ${code}`;
}

export function useSpeechRecognition({
  lang = "uk-UA",
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  // Тримаємо ref-и на колбеки, щоб event-listener-и стабільно бачили
  // свіжі onResult/onError без де-реєстрації на кожному рендері.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  // Стартова перевірка доступності native розпізнавача. Виконується
  // 1 раз на mount — `isRecognitionAvailable` синхронний і дешевий.
  useEffect(() => {
    try {
      setSupported(
        Boolean(ExpoSpeechRecognitionModule.isRecognitionAvailable()),
      );
    } catch {
      setSupported(false);
    }
  }, []);

  // Реєструємо native-event-листенери один раз. `addListener` повертає
  // `EventSubscription`, який знімаємо в cleanup-у.
  useEffect(() => {
    const subs = [
      addSpeechRecognitionListener("start", () => {
        setListening(true);
      }),
      addSpeechRecognitionListener("end", () => {
        setListening(false);
      }),
      addSpeechRecognitionListener(
        "result",
        (event: ExpoSpeechRecognitionResultEvent) => {
          // На iOS-17- `interimResults: false` все одно дає тільки final
          // на `stop()`. На iOS-18+ і Android — final, коли `isFinal=true`.
          // Ми приймаємо тільки final, щоб не спамити onResult interim-ами.
          if (!event.isFinal) return;
          const first = event.results[0];
          const transcript = (first?.transcript ?? "").trim();
          if (transcript) onResultRef.current?.(transcript);
        },
      ),
      addSpeechRecognitionListener(
        "error",
        (event: ExpoSpeechRecognitionErrorEvent) => {
          setListening(false);
          const msg = describeError(event.error, event.message);
          if (msg) onErrorRef.current?.(msg);
        },
      ),
    ];
    return () => {
      for (const sub of subs) {
        try {
          sub.remove();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      onErrorRef.current?.(
        "Голосовий ввід не підтримується на цьому пристрої.",
      );
      return;
    }
    // Дозволи лазі — НЕ при mount-і. Це critical UX: ми не показуємо
    // permission-prompt доки юзер фактично не тапнув мікрофон.
    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((result) => {
        if (!result.granted) {
          onErrorRef.current?.(
            "Немає дозволу на використання мікрофону. Дозволь у налаштуваннях.",
          );
          return;
        }
        try {
          ExpoSpeechRecognitionModule.start({
            lang,
            interimResults: false,
            maxAlternatives: 1,
            continuous: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onErrorRef.current?.(`Не вдалося стартувати розпізнавач: ${msg}`);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        onErrorRef.current?.(`Не вдалося запитати дозвіл: ${msg}`);
      });
  }, [lang, supported]);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* noop — модуль не запущений */
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Безпечний cleanup: якщо компонент розмантовується посеред сесії —
  // abort, щоб не залишити висячий native-recognizer.
  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { listening, supported, start, stop, toggle };
}
