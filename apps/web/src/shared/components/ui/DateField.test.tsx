/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateField } from "./DateField";

describe("DateField", () => {
  it("keeps the native date input inside the available inline size", () => {
    const { container } = render(
      <DateField id="due" value="" onChange={() => undefined} />,
    );
    const input = screen.getByLabelText("Обери дату", { selector: "input" });
    expect(input).toHaveClass("min-w-0", "max-w-full", "[min-inline-size:0]");
    expect(input.parentElement).toHaveClass("w-full", "min-w-0", "max-w-full");
    expect(input.parentElement?.parentElement?.parentElement).toHaveClass(
      "overflow-hidden",
      "border",
      "border-line",
      "focus-within:border-brand-400",
    );
    expect(input).toHaveClass("border-0", "focus-visible:ring-0");
    expect(
      input.parentElement?.parentElement?.parentElement?.parentElement,
    ).toHaveClass("w-full", "min-w-0", "max-w-full");
    expect(container.firstElementChild).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full",
    );
  });

  it("shows an empty label until the native picker receives focus", () => {
    render(
      <DateField
        id="birthday"
        label="Дата народження"
        emptyLabel="ДД.ММ.РРРР"
        value=""
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("ДД.ММ.РРРР")).toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("Дата народження"));
    expect(screen.queryByText("ДД.ММ.РРРР")).not.toBeInTheDocument();
  });

  it("does not cover a selected date", () => {
    render(
      <DateField
        id="birthday"
        emptyLabel="ДД.ММ.РРРР"
        value="2026-07-16"
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByText("ДД.ММ.РРРР")).not.toBeInTheDocument();
  });
});

describe("DateField — межі календаря (beta-input-boundaries)", () => {
  it("клемпить нативний пікер жорстким вікном", () => {
    const { container } = render(<DateField value="2026-08-01" readOnly />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("min")).toBe("1970-01-01");
    expect(input.getAttribute("max")).toBe("2100-01-01");
  });

  it("попереджає про дату поза мʼяким вікном, не позначаючи полем з помилкою", () => {
    const { getByText, container } = render(
      <DateField value="2019-01-01" readOnly />,
    );
    expect(
      getByText("Незвична дата — перевір, чи не помилка в році"),
    ).toBeInTheDocument();
    expect(
      container.querySelector("input")!.getAttribute("aria-invalid"),
    ).toBeNull();
  });

  it("позначає помилкою дату поза жорстким вікном", () => {
    const { getByRole, container } = render(
      <DateField value="3025-01-01" readOnly />,
    );
    expect(getByRole("alert")).toHaveTextContent(
      "Дата поза допустимим діапазоном",
    );
    expect(container.querySelector("input")!.getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("власний helperText виклику перекриває похідний", () => {
    const { getByText, queryByText } = render(
      <DateField
        value="2019-01-01"
        helperText="Дата початку підписки"
        readOnly
      />,
    );
    expect(getByText("Дата початку підписки")).toBeInTheDocument();
    expect(
      queryByText("Незвична дата — перевір, чи не помилка в році"),
    ).toBeNull();
  });

  it("bounded={false} повністю вимикає перевірку", () => {
    const { queryByText, container } = render(
      <DateField value="3025-01-01" bounded={false} readOnly />,
    );
    expect(queryByText("Дата поза допустимим діапазоном")).toBeNull();
    expect(container.querySelector("input")!.getAttribute("min")).toBeNull();
  });

  it("порожнє поле не попереджає", () => {
    const { queryByRole } = render(<DateField value="" readOnly />);
    expect(queryByRole("alert")).toBeNull();
  });
});
