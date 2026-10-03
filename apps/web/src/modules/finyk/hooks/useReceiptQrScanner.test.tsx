// @vitest-environment jsdom
/**
 * Last validated: 2026-08-17
 * Status: Active
 * Camera + zxing mocked at the import boundary (mirrors
 * `modules/nutrition/hooks/useBarcodeScanner.test.tsx`).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decodeFromStreamMock = vi.fn();
const decodeFromImageUrlMock = vi.fn();
vi.mock("@zxing/browser/esm/readers/BrowserQRCodeReader.js", () => ({
  BrowserQRCodeReader: class {
    decodeFromStream = decodeFromStreamMock;
    decodeFromImageUrl = decodeFromImageUrlMock;
    reset = vi.fn();
  },
}));

import {
  decodeQrFromImageFile,
  useReceiptQrScanner,
} from "./useReceiptQrScanner";

function makeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], _track: track } as unknown as MediaStream;
}

function attachVideo(result: { current: { videoRef: { current: unknown } } }) {
  act(() => {
    result.current.videoRef.current = {
      srcObject: null,
      readyState: 2,
      videoWidth: 640,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement;
  });
}

beforeEach(() => {
  decodeFromStreamMock.mockReset();
  decodeFromImageUrlMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("useReceiptQrScanner", () => {
  it("reports a friendly status when getUserMedia is unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    const { result } = renderHook(() =>
      useReceiptQrScanner({ active: true, onDetected: vi.fn() }),
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
      useReceiptQrScanner({ active: true, onDetected: vi.fn() }),
    );
    await waitFor(() =>
      expect(result.current.status).toMatch(/Не вдалося відкрити камеру/),
    );
  });

  it("does nothing when inactive", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    renderHook(() =>
      useReceiptQrScanner({ active: false, onDetected: vi.fn() }),
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("uses the native BarcodeDetector (qr_code) path and reports the raw QR text", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const detect = vi
      .fn()
      .mockResolvedValue([{ rawValue: "https://cabinet.tax.gov.ua/x" }]);
    class FakeDetector {
      static getSupportedFormats = vi.fn().mockResolvedValue(["qr_code"]);
      detect = detect;
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector =
      FakeDetector as unknown;

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
      useReceiptQrScanner({ active: true, onDetected }),
    );
    attachVideo(result);

    await waitFor(() => expect(onDetected).toHaveBeenCalled());
    expect(onDetected).toHaveBeenCalledWith("https://cabinet.tax.gov.ua/x");
  });

  it("falls back to zxing when no BarcodeDetector is present", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const { result } = renderHook(() =>
      useReceiptQrScanner({ active: true, onDetected: vi.fn() }),
    );
    attachVideo(result);

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalled());
  });

  it("stops camera tracks on unmount", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    decodeFromStreamMock.mockResolvedValue({ stop: vi.fn() });

    const { result, unmount } = renderHook(() =>
      useReceiptQrScanner({ active: true, onDetected: vi.fn() }),
    );
    attachVideo(result);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await waitFor(() =>
      expect(
        (stream as unknown as { _track: { stop: ReturnType<typeof vi.fn> } })
          ._track.stop,
      ).toHaveBeenCalled(),
    );
  });
});

describe("decodeQrFromImageFile", () => {
  it("returns the decoded text when zxing finds a QR code in the image", async () => {
    decodeFromImageUrlMock.mockResolvedValue({ getText: () => "QR-PAYLOAD" });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    await expect(decodeQrFromImageFile(file)).resolves.toBe("QR-PAYLOAD");
  });

  it("returns null when zxing finds no QR code", async () => {
    decodeFromImageUrlMock.mockRejectedValue(new Error("not found"));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    await expect(decodeQrFromImageFile(file)).resolves.toBeNull();
  });

  it("revokes the object URL even when decoding fails", async () => {
    decodeFromImageUrlMock.mockRejectedValue(new Error("boom"));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL,
    });
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    await decodeQrFromImageFile(file);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
