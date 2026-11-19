// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { blurActiveField, keepFieldFocusProps } from "./keepFieldFocus";

afterEach(cleanup);

describe("keepFieldFocusProps", () => {
  it("скасовує mousedown, тож фокус лишається в полі", () => {
    render(
      <>
        <input aria-label="Поле" />
        <button type="button" {...keepFieldFocusProps}>
          Дія
        </button>
      </>,
    );
    expect(
      fireEvent.mouseDown(screen.getByRole("button", { name: "Дія" })),
    ).toBe(false);
  });
});

describe("blurActiveField", () => {
  it("знімає фокус із поля вводу", () => {
    render(<input aria-label="Поле" />);
    const field = screen.getByLabelText("Поле");
    field.focus();
    blurActiveField();
    expect(document.activeElement).not.toBe(field);
  });

  it("не чіпає сфокусовану кнопку: це не поле, клавіатури під нею немає", () => {
    render(<button type="button">Кнопка</button>);
    const button = screen.getByRole("button", { name: "Кнопка" });
    button.focus();
    blurActiveField();
    expect(document.activeElement).toBe(button);
  });
});
