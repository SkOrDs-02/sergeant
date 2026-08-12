// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarcodeSection } from "./BarcodeSection";

describe("BarcodeSection", () => {
  it("shows only the scanner action and hides manual barcode controls", () => {
    const setBarcodeStatus = vi.fn();
    const setScannerOpen = vi.fn();
    render(
      <BarcodeSection
        barcodeStatus=""
        setBarcodeStatus={setBarcodeStatus}
        setScannerOpen={setScannerOpen}
      />,
    );

    expect(screen.queryByLabelText("Штрихкод")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Знайти" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Прив'язати" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("barcode-action-icon")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сканувати штрихкод" }));
    expect(setBarcodeStatus).toHaveBeenCalledWith("");
    expect(setScannerOpen).toHaveBeenCalledWith(true);
  });
});
