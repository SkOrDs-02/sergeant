// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColumnMapper } from "./ColumnMapper";

const headers = ["Дата операції", "Сума", "Опис", "Баланс"];
const sampleRows = [
  ["01.08.2026", "-150,75", "Сільпо", "12345,00"],
  ["02.08.2026", "-25,00", "АТБ", "12320,00"],
];

describe("ColumnMapper", () => {
  it("renders every header + sample row for the preview table", () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={vi.fn()}
      />,
    );
    for (const h of headers) {
      expect(screen.getAllByText(h).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("АТБ")).toBeInTheDocument();
  });

  it("defaults the date/amount/description pickers to the first three headers", () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Колонка дати")).toHaveValue("Дата операції");
    expect(screen.getByLabelText("Колонка суми (витрати)")).toHaveValue("Сума");
    expect(screen.getByLabelText("Колонка опису")).toHaveValue("Опис");
  });

  it("submits the exact ImportColumnMapping the user picked", () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Колонка дати"), {
      target: { value: "Дата операції" },
    });
    fireEvent.change(screen.getByLabelText("Колонка суми (витрати)"), {
      target: { value: "Сума" },
    });
    fireEvent.change(screen.getByLabelText("Колонка опису"), {
      target: { value: "Опис" },
    });
    fireEvent.change(screen.getByLabelText("Формат дати"), {
      target: { value: "YYYY-MM-DD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));

    expect(onSubmit).toHaveBeenCalledWith({
      dateCol: "Дата операції",
      amountCol: "Сума",
      descriptionCol: "Опис",
      dateFormat: "YYYY-MM-DD",
      decimalComma: true,
    });
  });

  it("toggling the decimal-comma switch flips the submitted mapping", () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(
      screen.getByText("Кома як десятковий роздільник").closest("label") ??
        screen.getByText("Кома як десятковий роздільник"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ decimalComma: false }),
    );
  });

  it("disables submit when headers is empty (no column can be picked)", () => {
    render(<ColumnMapper headers={[]} sampleRows={[]} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Продовжити" })).toBeDisabled();
  });

  it("shows the loading state on the submit button while isSubmitting", () => {
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={vi.fn()}
        isSubmitting
      />,
    );
    // `loading` replaces the visible label with an `aria-hidden` span
    // (`Button.tsx`), so query by role only — there is exactly one button
    // in this component.
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});
