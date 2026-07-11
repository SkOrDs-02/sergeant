// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarcodeSection } from "./BarcodeSection";

describe("BarcodeSection", () => {
  it("strips whitespace from barcode input", () => {
    const setBarcode = vi.fn();
    const setBarcodeStatus = vi.fn();
    render(
      <BarcodeSection
        barcode=""
        setBarcode={setBarcode}
        barcodeStatus=""
        setBarcodeStatus={setBarcodeStatus}
        handleBarcodeLookup={vi.fn()}
        handleBarcodeBind={vi.fn()}
        setScannerOpen={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Штрихкод"), {
      target: { value: "48 0123" },
    });
    expect(setBarcode).toHaveBeenCalledWith("480123");
  });

  it("invokes lookup and scanner handlers", () => {
    const handleBarcodeLookup = vi.fn();
    const setScannerOpen = vi.fn();
    render(
      <BarcodeSection
        barcode="123"
        setBarcode={vi.fn()}
        barcodeStatus=""
        setBarcodeStatus={vi.fn()}
        handleBarcodeLookup={handleBarcodeLookup}
        handleBarcodeBind={vi.fn()}
        setScannerOpen={setScannerOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Знайти" }));
    expect(handleBarcodeLookup).toHaveBeenCalledWith("123");
    fireEvent.click(screen.getByRole("button", { name: /Сканувати/ }));
    expect(setScannerOpen).toHaveBeenCalledWith(true);
  });
});
