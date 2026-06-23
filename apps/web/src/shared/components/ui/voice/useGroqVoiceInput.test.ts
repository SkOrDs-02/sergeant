// @vitest-environment jsdom
/**
 * Tests for `useGroqVoiceInput` — Groq Whisper server-side STT.
 *
 * Stubs `MediaRecorder`, `navigator.mediaDevices.getUserMedia`, and the
 * `transcribeApi` so the record → upload → outcome-mapping pipeline can be
 * exercised without real audio hardware or network. Recording duration is
 * controlled via a `Date.now` spy (real timers — fake timers + `waitFor`
 * deadlock against each other).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const send = vi.fn();
vi.mock("@shared/api", () => ({
  transcribeApi: { send: (...args: unknown[]) => send(...args) },
}));

import { useGroqVoiceInput } from "./useGroqVoiceInput";

let clock = 1_000_000;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  private listeners: Record<string, Array<(e: unknown) => void>> = {};
  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }
  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  private fire(type: string, e?: unknown) {
    for (const cb of this.listeners[type] ?? []) cb(e);
  }
  start() {
    this.state = "recording";
    this.fire("start");
  }
  /** Stop, optionally advancing the clock first so duration > min. */
  stop() {
    this.state = "inactive";
    this.fire("dataavailable", { data: { size: 10 } });
    this.fire("stop");
  }
  emitError() {
    this.fire("error");
  }
}

function installAudioStack(): void {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
  vi.stubGlobal("FormData", class {} as unknown);
}

/** Record long enough to clear the GROQ_MIN_DURATION_MS floor, then stop. */
async function recordAndStop(
  result: { current: ReturnType<typeof useGroqVoiceInput> },
  durationMs = 1000,
): Promise<void> {
  await act(async () => {
    result.current.start();
  });
  clock += durationMs; // advance the Date.now spy → recording duration
  await act(async () => {
    result.current.stop();
  });
}

describe("useGroqVoiceInput", () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.isTypeSupported = vi.fn(() => true);
    send.mockReset();
    clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    installAudioStack();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports supported when the audio stack is present", async () => {
    const { result } = renderHook(() => useGroqVoiceInput());
    await waitFor(() => expect(result.current.supported).toBe(true));
  });

  it("reports unsupported without MediaRecorder", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const { result } = renderHook(() => useGroqVoiceInput());
    await waitFor(() => expect(result.current.supported).toBe(false));
  });

  it("records, uploads, and surfaces a successful transcript", async () => {
    send.mockResolvedValue({ outcome: "ok", data: { text: "  привіт  " } });
    const onResult = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onResult }));
    await recordAndStop(result);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("привіт"));
  });

  it("warns on an empty successful transcript", async () => {
    send.mockResolvedValue({ outcome: "ok", data: { text: "   " } });
    const onError = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onError }));
    await recordAndStop(result);
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("розпізнати"),
      ),
    );
  });

  it("maps provider_unavailable to a fallback callback + error", async () => {
    send.mockResolvedValue({ outcome: "provider_unavailable" });
    const onProviderUnavailable = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useGroqVoiceInput({ onProviderUnavailable, onError }),
    );
    await recordAndStop(result);
    await waitFor(() => expect(onProviderUnavailable).toHaveBeenCalled());
    expect(onError).toHaveBeenCalled();
  });

  it("maps rate_limited / payload_too_large / unauthorized outcomes to errors", async () => {
    const onError = vi.fn();
    for (const outcome of [
      "rate_limited",
      "payload_too_large",
      "unauthorized",
      "unsupported_media_type",
    ] as const) {
      send.mockResolvedValueOnce({ outcome });
      const { result, unmount } = renderHook(() =>
        useGroqVoiceInput({ onError }),
      );
      await recordAndStop(result);
      await waitFor(() => expect(onError).toHaveBeenCalled());
      onError.mockClear();
      unmount();
    }
  });

  it("rejects a too-short recording before uploading", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onError }));
    // duration 0 (< GROQ_MIN_DURATION_MS) → no upload
    await recordAndStop(result, 0);
    expect(send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("короткий"));
  });

  it("surfaces a getUserMedia permission denial", async () => {
    (
      navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      Object.assign(new Error("no"), { name: "NotAllowedError" }),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onError }));
    await act(async () => {
      await result.current.start();
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("дозволу"));
    expect(result.current.listening).toBe(false);
  });

  it("emits an error when the recorder errors mid-record", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onError }));
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      FakeMediaRecorder.instances.at(-1)!.emitError();
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("запис"));
  });

  it("toggle starts then stops", async () => {
    send.mockResolvedValue({ outcome: "ok", data: { text: "x" } });
    const { result } = renderHook(() => useGroqVoiceInput());
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.listening).toBe(true);
    clock += 1000;
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.listening).toBe(false));
  });
});
