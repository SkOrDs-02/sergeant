// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `useBarcodeScanner` / `useWebScanner` / `scanBarcodeNative`.
 * Camera + zxing + ML Kit are all mocked at their import boundaries.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isCapacitorMock = vi.fn();
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, isCapacitor: () => isCapacitorMock() };
});

const scanNativeMock = vi.fn();
vi.mock("@sergeant/mobile-shell/barcodeNative", () => ({
  scanBarcodeNative: () => scanNativeMock(),
}));

const decodeFromStreamMock = vi.fn();
vi.mock("@zxing/browser/esm/readers/BrowserMultiFormatOneDReader.js", () => ({
  BrowserMultiFormatOneDReader: class {
    decodeFromStream = decodeFromStreamMock;
    reset = vi.fn();
  },
}));

import {
  scanBarcodeNative,
  useBarcodeScanner,
  useWebScanner,
} from "./useBarcodeScanner";

function makeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], _track: track } as unknown as MediaStream;
}

beforeEach(() => {
  isCapacitorMock.mockReset();
  scanNativeMock.mockReset();
  decodeFromStreamMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  // Clean any BarcodeDetector we attached.
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("scanBarcodeNative", () => {
  it("delegates to the mobile-shell ML Kit adapter", async () => {
    scanNativeMock.mockResolvedValue({ code: "123", format: "ean_13" });
    await expect(scanBarcodeNative()).resolves.toEqual({
      code: "123",
      format: "ean_13",
    });
  });
});

describe("useBarcodeScanner", () => {
  it("reports isNative=false on web and throws from scan()", async () => {
    isCapacitorMock.mockReturnValue(false);
    const { result } = renderHook(() => useBarcodeScanner());
    expect(result.current.isNative).toBe(false);
    await expect(result.current.scan()).rejects.toThrow(/UI-driven/);
  });

  it("reports isNative=true on capacitor and delegates scan()", async () => {
    isCapacitorMock.mockReturnValue(true);
    scanNativeMock.mockResolvedValue({ code: "42", format: "" });
    const { result } = renderHook(() => useBarcodeScanner());
    expect(result.current.isNative).toBe(true);
    await expect(result.current.scan()).resolves.toEqual({
      code: "42",
      format: "",
    });
  });
});

describe("useWebScanner", () => {
  it("reports a friendly status when getUserMedia is unavailable", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: undefined,
    });
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() =>
      expect(result.current.status).toMatch(/Камера недоступна/),
    );
  });

  it("reports a permission error when getUserMedia rejects", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() =>
      expect(result.current.status).toMatch(/Не вдалося відкрити камеру/),
    );
  });

  it("does nothing when inactive", () => {
    const onDetected = vi.fn();
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    renderHook(() => useWebScanner({ active: false, onDetected }));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("uses the native BarcodeDetector path and reports a detected code", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const detect = vi
      .fn()
      .mockResolvedValue([{ rawValue: "4820000000001", format: "ean_13" }]);
    class FakeDetector {
      static getSupportedFormats = vi.fn().mockResolvedValue(["ean_13"]);
      detect = detect;
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      FakeDetector as unknown;

    // Drive requestAnimationFrame synchronously so the detect tick runs.
    let rafCount = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        if (rafCount++ < 3) queueMicrotask(() => cb(performance.now()));
        return rafCount;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockReturnValue(10_000);

    const onDetected = vi.fn();
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected }),
    );
    // Attach a fake ready video element.
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });

    await waitFor(() => expect(onDetected).toHaveBeenCalled());
    expect(onDetected).toHaveBeenCalledWith({
      code: "4820000000001",
      format: "ean_13",
    });
  });

  it("falls back to zxing when no BarcodeDetector is present", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    // No window.BarcodeDetector → zxing path.
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const onDetected = vi.fn();
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected }),
    );
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalled());
  });

  it("stops the camera tracks on unmount", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const { result, unmount } = renderHook(() =>
      useWebScanner({ active: true, onDetected: vi.fn() }),
    );
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await waitFor(() =>
      expect(
        (stream as unknown as { _track: { stop: ReturnType<typeof vi.fn> } })
          ._track.stop,
      ).toHaveBeenCalled(),
    );
  });

  it("falls through to zxing when BarcodeDetector reports no wanted formats", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    // BarcodeDetector only supports QR — no ean/upc/code128 overlap
    class NoFormatDetector {
      static getSupportedFormats = vi
        .fn()
        .mockResolvedValue(["qr_code", "aztec"]);
      detect = vi.fn().mockResolvedValue([]);
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      NoFormatDetector as unknown;
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const onDetected = vi.fn();
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected }),
    );
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });

    // Should fall through to zxing when BarcodeDetector lacks product formats
    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalled());
  });

  it("falls through to zxing when BarcodeDetector.getSupportedFormats throws", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    class ThrowingDetector {
      static getSupportedFormats = vi
        .fn()
        .mockRejectedValue(new Error("not supported"));
      detect = vi.fn();
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      ThrowingDetector as unknown;
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const onDetected = vi.fn();
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected }),
    );
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalled());
  });

  it("BarcodeDetector consecutive errors (≥5) fall back to zxing", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const detect = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("detect failed"));
    });
    class ErrorDetector {
      static getSupportedFormats = vi.fn().mockResolvedValue(["ean_13"]);
      detect = detect;
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      ErrorDetector as unknown;
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    // Drive rAF synchronously to tick through the error loop
    let rafCount = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        if (rafCount++ < 8) queueMicrotask(() => cb(performance.now()));
        return rafCount;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    // Ensure each tick passes the 150 ms throttle guard
    vi.spyOn(performance, "now").mockImplementation(() => rafCount * 200);

    const onDetected = vi.fn();
    const { result } = renderHook(() =>
      useWebScanner({ active: true, onDetected }),
    );
    act(() => {
      result.current.videoRef.current = {
        srcObject: null,
        readyState: 2,
        videoWidth: 640,
        play: vi.fn().mockResolvedValue(undefined),
      } as unknown as HTMLVideoElement;
    });

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalled());
  });
});
