// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  VOICE_KEYWORDS,
  unlockTTS,
  speak,
  stopSpeaking,
} from "./hubChatSpeech";

interface FakeSynth {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  speaking: boolean;
}

let synth: FakeSynth;
const utterances: Array<{ text: string; lang?: string; voice?: unknown }> = [];

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  constructor(text: string) {
    this.text = text;
    utterances.push(this);
  }
}

beforeEach(() => {
  utterances.length = 0;
  synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    speaking: false,
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  // jsdom window.speechSynthesis
  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
  });
  // @ts-expect-error test global
  window.SpeechSynthesisUtterance = FakeUtterance;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("VOICE_KEYWORDS", () => {
  it("matches voice-intent keywords", () => {
    expect(VOICE_KEYWORDS.test("скажи це вголос")).toBe(true);
    expect(VOICE_KEYWORDS.test("озвуч відповідь")).toBe(true);
    expect(VOICE_KEYWORDS.test("прочитай мені")).toBe(true);
    expect(VOICE_KEYWORDS.test("просто текст")).toBe(false);
  });
});

describe("unlockTTS", () => {
  it("speaks an empty unlock utterance", () => {
    unlockTTS();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0]?.text).toBe("");
  });
});

describe("speak", () => {
  it("cleans markup and speaks when voices are ready", () => {
    synth.getVoices.mockReturnValue([{ lang: "uk-UA", name: "Ukrainian" }]);
    speak("✅ [мітка] Привіт id:abc123 https://x.com **жирний**");
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const spoken = utterances[utterances.length - 1];
    expect(spoken?.text).not.toContain("[мітка]");
    expect(spoken?.text).not.toContain("id:abc123");
    expect(spoken?.text).not.toContain("https://");
    expect(spoken?.text).not.toContain("**");
    expect(spoken?.lang).toBe("uk-UA");
  });

  it("does nothing for text that cleans to empty", () => {
    speak("[мітка] id:x");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("waits for voiceschanged when no voices yet", () => {
    vi.useFakeTimers();
    synth.getVoices.mockReturnValue([]);
    speak("Привіт світ");
    expect(synth.addEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function),
      { once: true },
    );
    // Fallback timer fires doSpeak when not already speaking.
    vi.advanceTimersByTime(500);
    expect(synth.speak).toHaveBeenCalled();
  });

  it("prefers uk-prefixed then ru voice when no exact uk-UA", () => {
    synth.getVoices.mockReturnValue([
      { lang: "ru-RU", name: "Russian" },
      { lang: "uk", name: "Ukr" },
    ]);
    speak("Привіт");
    const spoken = utterances[utterances.length - 1];
    expect(spoken?.voice).toMatchObject({ lang: "uk" });
  });
});

describe("stopSpeaking", () => {
  it("cancels synthesis", () => {
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
