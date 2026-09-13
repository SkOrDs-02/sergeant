/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * РЕГРЕСІЯ: кнопка зникала посеред сесії на iOS standalone-PWA.
 *
 * Ланцюжок був такий. `isGroqSupported()` перевіряє лише наявність
 * `getUserMedia`/`MediaRecorder`, тож на iOS-PWA Groq «підтримується».
 * Web Speech там формально існує, але не працює (WebKit 185448/215884),
 * і `useVoiceInput` це вже враховує — `supported === false`. Коли
 * `/api/transcribe` віддавав 503, хук сліпо кликав `onProviderUnavailable`,
 * компонент так само сліпо ставив `forceFallback`, `active` ставав
 * непідтримуваним webspeech — і рендер падав у `return null`. Людина щойно
 * говорила, їй написали «перемикаюсь на браузерне розпізнавання», після
 * чого не лишилось ні кнопки, ні пояснення.
 *
 * Тести тут ганяють РІШЕННЯ про фолбек, а не самих провайдерів, тож обидва
 * хуки замокані: інакше довелося б відтворювати `MediaRecorder`, стрім і
 * мережу, а перевіряється рівно одна гілка — чи дивиться компонент на
 * `webspeech.supported`, перш ніж перемикатись.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { VoiceMicButton } from "./VoiceMicButton";

const state = vi.hoisted(() => ({
  webspeechSupported: true,
  groqSupported: true,
  webspeechToggle: vi.fn(),
  groqToggle: vi.fn(),
  /** Хендлер, який компонент передав у Groq-хук на останньому рендері. */
  fireProviderUnavailable: null as (() => void) | null,
}));

vi.mock("./voice/useVoiceInput", () => ({
  useVoiceInput: () => ({
    listening: false,
    supported: state.webspeechSupported,
    start: () => {},
    stop: () => {},
    toggle: state.webspeechToggle,
  }),
}));

vi.mock("./voice/useGroqVoiceInput", () => ({
  useGroqVoiceInput: (opts: { onProviderUnavailable?: () => void } = {}) => {
    state.fireProviderUnavailable = opts.onProviderUnavailable ?? null;
    return {
      listening: false,
      uploading: false,
      supported: state.groqSupported,
      start: () => {},
      stop: () => {},
      toggle: state.groqToggle,
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_VOICE_INPUT", "1");
  state.webspeechSupported = true;
  state.groqSupported = true;
  state.fireProviderUnavailable = null;
  state.webspeechToggle.mockClear();
  state.groqToggle.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("VoiceMicButton — 503 від /api/transcribe", () => {
  it("без Web Speech кнопка ЛИШАЄТЬСЯ на екрані", () => {
    // Рівно конфігурація iOS standalone-PWA: запис є, розпізнавання нема.
    state.webspeechSupported = false;
    const { container } = render(<VoiceMicButton onResult={() => {}} />);
    expect(container.querySelector("button")).not.toBeNull();

    act(() => {
      state.fireProviderUnavailable?.();
    });

    expect(container.querySelector("button")).not.toBeNull();
  });

  it("без Web Speech наступний тап іде в Groq, а не в мертвий фолбек", () => {
    state.webspeechSupported = false;
    const { container } = render(<VoiceMicButton onResult={() => {}} />);

    act(() => {
      state.fireProviderUnavailable?.();
    });
    act(() => {
      container.querySelector("button")!.click();
    });

    // 503 віддається ДО звернення до upstream, тож повтор нічого не коштує
    // і в кращому випадку потрапляє на вже налаштований ключ.
    expect(state.groqToggle).toHaveBeenCalledTimes(1);
    expect(state.webspeechToggle).not.toHaveBeenCalled();
  });

  it("без Web Speech текст НЕ обіцяє перемикання, якого не буде", () => {
    state.webspeechSupported = false;
    const onError = vi.fn();
    render(<VoiceMicButton onResult={() => {}} onError={onError} />);

    act(() => {
      state.fireProviderUnavailable?.();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const message = String(onError.mock.calls[0]?.[0] ?? "");
    // Головне тут не формулювання, а відсутність обіцянки: саме вона
    // робила зниклу кнопку незрозумілою.
    expect(message).not.toMatch(/перемикаю/i);
    expect(message.length).toBeGreaterThan(0);
  });

  it("із Web Speech фолбек відбувається, і наступний тап іде вже в нього", () => {
    state.webspeechSupported = true;
    const onError = vi.fn();
    const { container } = render(
      <VoiceMicButton onResult={() => {}} onError={onError} />,
    );

    act(() => {
      state.fireProviderUnavailable?.();
    });
    act(() => {
      container.querySelector("button")!.click();
    });

    expect(container.querySelector("button")).not.toBeNull();
    expect(state.webspeechToggle).toHaveBeenCalledTimes(1);
    expect(state.groqToggle).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]?.[0] ?? "")).toMatch(/перемикаю/i);
  });
});
