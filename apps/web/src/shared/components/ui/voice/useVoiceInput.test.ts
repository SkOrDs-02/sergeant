// @vitest-environment jsdom
/**
 * Tests for `useVoiceInput` — Web Speech API wrapper (fallback voice path).
 *
 * A controllable `SpeechRecognition` stub drives the start/result/error/end
 * lifecycle deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceInput } from "./useVoiceInput";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  start = vi.fn(() => {
    this.onstart?.();
  });
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
  emitResult(transcript: string) {
    this.onresult?.({ results: [[{ transcript }]] });
  }
  emitError(error: string) {
    this.onerror?.({ error });
  }
  get last() {
    return this;
  }
}

function installSpeechRecognition(): void {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
    FakeRecognition;
}

function removeSpeechRecognition(): void {
  delete (window as unknown as { SpeechRecognition?: unknown })
    .SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
}

describe("useVoiceInput", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    installSpeechRecognition();
  });

  afterEach(() => {
    removeSpeechRecognition();
    vi.restoreAllMocks();
  });

  it("reports supported when SpeechRecognition exists", () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.supported).toBe(true);
  });

  it("reports unsupported when SpeechRecognition is absent", () => {
    removeSpeechRecognition();
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.supported).toBe(false);
  });

  it("start() begins listening and fires onResult on a transcript", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onResult }));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    const rec = FakeRecognition.instances.at(-1)!;
    act(() => rec.emitResult("привіт"));
    expect(onResult).toHaveBeenCalledWith("привіт");
  });

  it("stop() ends the session and clears listening", () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
  });

  it("toggle() starts then stops", () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
  });

  it("calls onError when start is invoked with no SpeechRecognition", () => {
    removeSpeechRecognition();
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onError }));
    act(() => result.current.start());
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("не підтримується"),
    );
  });

  it("maps the not-allowed error to a permission message", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onError }));
    act(() => result.current.start());
    const rec = FakeRecognition.instances.at(-1)!;
    act(() => rec.emitError("not-allowed"));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("дозволу"));
    expect(result.current.listening).toBe(false);
  });

  it("maps the no-speech error to a retry message", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onError }));
    act(() => result.current.start());
    act(() => FakeRecognition.instances.at(-1)!.emitError("no-speech"));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("розпізнати"));
  });

  it("silently ignores the aborted error", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onError }));
    act(() => result.current.start());
    act(() => FakeRecognition.instances.at(-1)!.emitError("aborted"));
    expect(onError).not.toHaveBeenCalled();
  });

  it("aborts the active recognition on unmount", () => {
    const { result, unmount } = renderHook(() => useVoiceInput());
    act(() => result.current.start());
    const rec = FakeRecognition.instances.at(-1)!;
    unmount();
    expect(rec.abort).toHaveBeenCalled();
  });
});
