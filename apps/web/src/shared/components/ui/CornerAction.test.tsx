/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SHEET_FOOTER_INSET_VAR } from "../../hooks/useBottomInsetVar";
import { AddAction } from "./CornerAction";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AddAction", () => {
  it("тримає тости над усім аркушем джерел, включно з кнопкою закриття і звільняє смугу після вибору", () => {
    // jsdom не має layout: задаємо геометрію всього dialog. Сам
    // AddAction, Sheet і публікація inset працюють без моків компонентів.
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const sourceTop = window.innerHeight - 340;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute("role") === "dialog") {
          return new DOMRect(0, sourceTop, 390, 340);
        }
        return originalRect.call(this);
      },
    );
    const onSelect = vi.fn();
    const root = document.documentElement;
    render(
      <AddAction
        sources={[
          { id: "photo", label: "Фото", hint: "Аналіз страви", onSelect },
          { id: "manual", label: "Вручну", hint: "Запис страви", onSelect },
        ]}
      />,
    );
    expect(root.style.getPropertyValue(SHEET_FOOTER_INSET_VAR)).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(screen.getByRole("dialog", { name: "Додати" })).toBeTruthy();
    expect(root.style.getPropertyValue(SHEET_FOOTER_INSET_VAR)).toBe("340px");

    fireEvent.click(screen.getByRole("button", { name: /Фото/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Додати" })).toBeNull();
    expect(root.style.getPropertyValue(SHEET_FOOTER_INSET_VAR)).toBe("");
  });
});
