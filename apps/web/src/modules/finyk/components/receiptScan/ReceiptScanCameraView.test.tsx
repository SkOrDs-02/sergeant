// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 * ReceiptScanCameraView: статус камери має оголошуватись (WCAG 4.1.3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useReceiptQrScannerMock = vi.fn((_opts?: unknown) => ({
  videoRef: { current: null },
  status: "",
}));
vi.mock("../../hooks/useReceiptQrScanner", () => ({
  useReceiptQrScanner: (opts: unknown) => useReceiptQrScannerMock(opts),
}));

import { ReceiptScanCameraView } from "./ReceiptScanCameraView";

beforeEach(() => {
  vi.clearAllMocks();
  useReceiptQrScannerMock.mockReturnValue({
    videoRef: { current: null },
    status: "",
  });
});

describe("ReceiptScanCameraView", () => {
  it("announces the camera status via role=alert", () => {
    useReceiptQrScannerMock.mockReturnValue({
      videoRef: { current: null },
      status: "Не вдалося відкрити камеру. Перевір дозволи.",
    });
    render(<ReceiptScanCameraView active onDetected={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося відкрити камеру. Перевір дозволи.",
    );
  });

  it("renders the idle hint without an alert", () => {
    render(<ReceiptScanCameraView active onDetected={vi.fn()} />);
    expect(
      screen.getByText("Наведи камеру на QR-код чека."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
