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
      screen.queryByRole("button", { name: "Привʼязати" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("barcode-action-icon")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сканувати штрихкод" }));
    expect(setBarcodeStatus).toHaveBeenCalledWith("");
    expect(setScannerOpen).toHaveBeenCalledWith(true);
  });

  it("типовий підпис кнопки — «Сканувати»", () => {
    render(
      <BarcodeSection
        barcodeStatus=""
        setBarcodeStatus={vi.fn()}
        setScannerOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Сканувати штрихкод" }),
    ).toHaveTextContent("Сканувати");
  });

  it("під вкладкою «Скан» кнопка стає повтором", () => {
    // Там сканер відкривається сам, тож кнопка — запасний вихід після
    // невдалого кадру, і підпис має казати саме це.
    render(
      <BarcodeSection
        barcodeStatus=""
        setBarcodeStatus={vi.fn()}
        setScannerOpen={vi.fn()}
        actionLabel="Сканувати ще раз"
      />,
    );
    // WCAG 2.5.3: голосове керування викликає кнопку тим, що видно, тож
    // доступна назва мусить містити видимий підпис, а не лишатись сталою.
    expect(
      screen.queryByRole("button", { name: "Сканувати штрихкод" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Сканувати ще раз" }),
    ).toHaveTextContent("Сканувати ще раз");
  });
});
