/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SHEET_FOOTER_INSET_VAR } from "../../hooks/useBottomInsetVar";
import { FAB_INSET_VAR, FAB_WIDTH_VAR } from "../../hooks/useBottomInsetVar";
import { AddAction, CornerAction } from "./CornerAction";

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

  it("малює `lead` над джерелами і дає йому закрити аркуш", () => {
    render(
      <AddAction
        sources={[
          { id: "photo", label: "Фото", hint: "Аналіз", onSelect() {} },
        ]}
        lead={(close) => (
          <button type="button" onClick={close}>
            Як учора
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    const lead = screen.getByRole("button", { name: "Як учора" });
    const source = screen.getByRole("button", { name: /Фото/ });
    expect(
      lead.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(lead);
    expect(screen.queryByRole("dialog", { name: "Додати" })).toBeNull();
  });
});

describe("CornerAction", () => {
  it("публікує ширину кнопки з полем і зазором у --sgt-fab-width і знімає при демонтажі", () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === "BUTTON") return new DOMRect(0, 0, 110, 44);
        return originalRect.call(this);
      },
    );
    const root = document.documentElement;
    const { unmount } = render(
      <CornerAction label="Додати" onClick={vi.fn()} />,
    );
    // 110 + 16 (поле колонки) + 12 (зазор)
    expect(root.style.getPropertyValue(FAB_WIDTH_VAR)).toBe("138px");
    unmount();
    expect(root.style.getPropertyValue(FAB_WIDTH_VAR)).toBe("");
  });

  it("публікує виміряну смугу (кнопка + відступ над навом) у --sgt-fab-inset і знімає при демонтажі", () => {
    // Трей тостів бере цю змінну в `max()` (рішення власника 2026-11-18),
    // тож значення мусить бути виміряним, а не 56/60/64 з голови.
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const bandTop = window.innerHeight - 131;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset["testid"] === "corner-action") {
          return new DOMRect(0, bandTop, 390, 58);
        }
        return originalRect.call(this);
      },
    );
    const root = document.documentElement;
    const { unmount } = render(
      <CornerAction label="Додати" onClick={vi.fn()} />,
    );
    expect(root.style.getPropertyValue(FAB_INSET_VAR)).toBe("131px");
    unmount();
    expect(root.style.getPropertyValue(FAB_INSET_VAR)).toBe("");
  });
});
