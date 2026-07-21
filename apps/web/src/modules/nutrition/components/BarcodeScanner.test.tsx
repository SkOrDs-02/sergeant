// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for BarcodeScanner — native vs web variant routing,
 * web variant close/detect flow.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BarcodeScanner } from "./BarcodeScanner";

// Mock useBarcodeScanner + useWebScanner + scanBarcodeNative
const isNativeMock = vi.fn(() => false);
const videoRefMock = { current: null };
const useWebScannerMock = vi.fn(
  (_opts?: unknown) =>
    ({
      videoRef: videoRefMock,
      status: "",
    }) as { videoRef: { current: null }; status: string },
);
type BarcodeResult = { code: string; format: string } | null;
const scanBarcodeNativeMock = vi.fn(
  (): Promise<BarcodeResult> => new Promise(() => {}), // hangs by default
);
const toastErrorMock = vi.fn();

vi.mock("../hooks/useBarcodeScanner", () => ({
  useBarcodeScanner: () => ({ isNative: isNativeMock() }),
  useWebScanner: (opts: unknown) => useWebScannerMock(opts),
  scanBarcodeNative: () => scanBarcodeNativeMock(),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  isNativeMock.mockReturnValue(false);
  useWebScannerMock.mockReturnValue({ videoRef: videoRefMock, status: "" });
  scanBarcodeNativeMock.mockImplementation(
    (): Promise<BarcodeResult> => new Promise(() => {}),
  );
});

describe("BarcodeScanner — web variant", () => {
  it("renders the web scanner dialog when not native", () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Сканер штрих-коду")).toBeInTheDocument();
  });

  it("renders a video element inside the scanner", () => {
    const { container } = render(
      <BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
    // Click the ✕ close button (aria-label="Закрити сканер")
    const closeBtns = screen.getAllByRole("button", {
      name: "Закрити сканер",
    });
    fireEvent.click(closeBtns[closeBtns.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
    // The backdrop is a button with aria-label="Закрити сканер"
    fireEvent.click(
      screen.getAllByRole("button", { name: "Закрити сканер" })[0]!,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows status text when useWebScanner returns a status", () => {
    useWebScannerMock.mockReturnValue({
      videoRef: videoRefMock,
      status: "Камера недоступна",
    });
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Камера недоступна")).toBeInTheDocument();
  });

  it("shows hint text when status is empty", () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Наведи камеру на штрих-код/)).toBeInTheDocument();
  });

  it("deactivates web scanning and reports the detected code", () => {
    const onDetected = vi.fn();
    render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />);
    const options = useWebScannerMock.mock.calls[0]?.[0] as {
      active: boolean;
      onDetected: (result: { code: string }) => void;
    };

    expect(options.active).toBe(true);
    act(() => {
      options.onDetected({ code: "4820000000012" });
    });

    expect(onDetected).toHaveBeenCalledWith("4820000000012");
    expect(useWebScannerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false }),
    );
  });
});

describe("BarcodeScanner — native variant", () => {
  it("renders sr-only status div for native scanner (no DOM UI)", async () => {
    isNativeMock.mockReturnValue(true);
    scanBarcodeNativeMock.mockResolvedValue(null as BarcodeResult);

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status.className).toContain("sr-only");
    // No dialog element for native variant
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onDetected when native scan returns a code", async () => {
    isNativeMock.mockReturnValue(true);
    const onDetected = vi.fn();
    scanBarcodeNativeMock.mockResolvedValue({
      code: "1234567890",
      format: "ean_13",
    } as BarcodeResult);

    await act(async () => {
      render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />);
      // Let the effect run
      await Promise.resolve();
    });

    expect(onDetected).toHaveBeenCalledWith("1234567890");
  });

  it("calls onClose when native scan returns null (user cancelled)", async () => {
    isNativeMock.mockReturnValue(true);
    const onClose = vi.fn();
    scanBarcodeNativeMock.mockResolvedValue(null as BarcodeResult);

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the permission toast and closes when native camera access is denied", async () => {
    isNativeMock.mockReturnValue(true);
    const onClose = vi.fn();
    scanBarcodeNativeMock.mockRejectedValue(
      new Error("camera-permission-denied"),
    );

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
      await Promise.resolve();
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Потрібен дозвіл на камеру. Увімкни його в налаштуваннях додатку.",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback unavailable toast for other native scan failures", async () => {
    isNativeMock.mockReturnValue(true);
    const onClose = vi.fn();
    scanBarcodeNativeMock.mockRejectedValue(new Error("native-unavailable"));

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
      await Promise.resolve();
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Сканер недоступний. Введи код вручну.",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
