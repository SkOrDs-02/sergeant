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
    expect(
      screen.getByLabelText("Колонка суми або витрат (дебет)"),
    ).toHaveValue("Сума");
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
    fireEvent.change(screen.getByLabelText("Колонка суми або витрат (дебет)"), {
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

  it("sends no creditCol by default (single signed-amount column)", () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={headers}
        sampleRows={sampleRows}
        onSubmit={onSubmit}
      />,
    );
    expect(
      screen.getByLabelText("Колонка надходжень (кредит), якщо окрема"),
    ).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));
    const submitted = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect("creditCol" in submitted).toBe(false);
  });

  it("passes the chosen credit column to onSubmit (debit/credit statements)", () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={["Дата", "Опис", "Дебет", "Кредит"]}
        sampleRows={[["21.09.2026", "Сільпо", "350,00", ""]]}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Колонка суми або витрат (дебет)"), {
      target: { value: "Дебет" },
    });
    fireEvent.change(
      screen.getByLabelText("Колонка надходжень (кредит), якщо окрема"),
      { target: { value: "Кредит" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amountCol: "Дебет", creditCol: "Кредит" }),
    );
  });

  it("does not offer the amount column as the credit column", () => {
    render(
      <ColumnMapper
        headers={["Дата", "Опис", "Дебет", "Кредит"]}
        sampleRows={[]}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Колонка суми або витрат (дебет)"), {
      target: { value: "Дебет" },
    });
    const credit = screen.getByLabelText(
      "Колонка надходжень (кредит), якщо окрема",
    );
    const options = Array.from(credit.querySelectorAll("option")).map(
      (o) => o.value,
    );
    expect(options).not.toContain("Дебет");
  });

  it("drops the credit column when the amount column is switched onto it", () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={["Дата", "Опис", "Дебет", "Кредит"]}
        sampleRows={[]}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Колонка надходжень (кредит), якщо окрема"),
      { target: { value: "Кредит" } },
    );
    fireEvent.change(screen.getByLabelText("Колонка суми або витрат (дебет)"), {
      target: { value: "Кредит" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));
    const submitted = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted["amountCol"]).toBe("Кредит");
    expect("creditCol" in submitted).toBe(false);
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
