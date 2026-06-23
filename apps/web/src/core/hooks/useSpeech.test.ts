// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeech } from "./useSpeech";

vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

interface FakeRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

let instances: FakeRec[] = [];

function installSR() {
  class SR implements FakeRec {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    abort = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
    SR as unknown;
}

function removeSR() {
  delete (window as unknown as { SpeechRecognition?: unknown })
    .SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
}

beforeEach(() => {
  instances = [];
});
afterEach(() => {
  removeSR();
  vi.restoreAllMocks();
});

describe("useSpeech", () => {
  it("reports unsupported when no SpeechRecognition on window", () => {
    removeSR();
    const { result } = renderHook(() => useSpeech(() => {}));
    expect(result.current.supported).toBe(false);
    act(() => result.current.toggle()); // no-op, should not throw
    expect(result.current.listening).toBe(false);
  });

  it("starts listening and delivers a transcript", () => {
    installSR();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeech(onResult));
    expect(result.current.supported).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    const rec = instances[0]!;
    expect(rec.lang).toBe("uk-UA");
    expect(rec.start).toHaveBeenCalled();

    act(() => {
      rec.onresult?.({ results: [[{ transcript: "привіт" }]] });
    });
    expect(onResult).toHaveBeenCalledWith("привіт");
  });

  it("toggling again aborts the recognizer", () => {
    installSR();
    const { result } = renderHook(() => useSpeech(() => {}));
    act(() => result.current.toggle());
    const rec = instances[0]!;
    act(() => result.current.toggle());
    expect(rec.abort).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("stops listening on error and on end", () => {
    installSR();
    const { result } = renderHook(() => useSpeech(() => {}));
    act(() => result.current.toggle());
    const rec = instances[0]!;
    act(() => rec.onerror?.({ error: "no-speech" }));
    expect(result.current.listening).toBe(false);

    act(() => result.current.toggle());
    const rec2 = instances[1]!;
    act(() => rec2.onend?.());
    expect(result.current.listening).toBe(false);
  });
});
