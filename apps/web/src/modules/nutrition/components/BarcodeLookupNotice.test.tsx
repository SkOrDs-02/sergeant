// @vitest-environment jsdom
/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Аудит nutrition E-6: 404 ("не знайдено") і 503 ("джерела не відповіли")
 * мають читатись по-різному, не одним текстовим рядком.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarcodeLookupNotice } from "./BarcodeLookupNotice";

describe("BarcodeLookupNotice", () => {
  it("not-found: offers photo capture (when provided) and manual entry — no retry", () => {
    const onDismiss = vi.fn();
    const onUsePhoto = vi.fn();
    render(
      <BarcodeLookupNotice
        kind="not-found"
        onDismiss={onDismiss}
        onUsePhoto={onUsePhoto}
      />,
    );
    expect(screen.getByText("Продукт не знайдено")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Спробувати ще раз" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Сфотографувати страву/ }),
    );
    expect(onUsePhoto).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("not-found: hides the photo CTA when onUsePhoto is not provided (pantry has no photo path)", () => {
    render(<BarcodeLookupNotice kind="not-found" onDismiss={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Сфотографувати страву/ }),
    ).toBeNull();
  });

  it("unavailable: says this does not mean the product is missing, and offers retry — no photo CTA", () => {
    const onRetry = vi.fn();
    render(
      <BarcodeLookupNotice
        kind="unavailable"
        onDismiss={vi.fn()}
        onRetry={onRetry}
        onUsePhoto={vi.fn()}
      />,
    );
    expect(screen.getByText("Джерела тимчасово не відповідають")).toBeTruthy();
    expect(screen.getByText(/не означає, що продукту немає/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Сфотографувати страву/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/**
 * Регресія вкладок: кнопка «Ввести вручну» вела в нікуди.
 *
 * До переходу на вкладки крок джерела був вертикальним стосом, і ручний
 * ввід справді було видно НИЖЧЕ картки — тому кнопка лише закривала
 * картку (`onDismiss`), і цього вистачало. Після вкладок на «Скані»
 * лишилась сама кнопка сканування, тож закриття картки кидало людину в
 * порожній екран: «просто викидає кнопку сканувати ще раз і все» (звіт
 * власника 2026-08-24). Сусідня «Сфотографувати страву» весь цей час
 * працювала, бо мала справжній перехід — контраст і виказав дефект.
 */
describe("BarcodeLookupNotice — «Ввести вручну» веде на ручний ввід", () => {
  it("кличе onManualEntry, коли перехід переданий", () => {
    const onManualEntry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <BarcodeLookupNotice
        kind="not-found"
        onDismiss={onDismiss}
        onManualEntry={onManualEntry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(onManualEntry).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("те саме для «джерела не відповідають» — маршрут виходу той самий", () => {
    const onManualEntry = vi.fn();
    render(
      <BarcodeLookupNotice
        kind="unavailable"
        onDismiss={vi.fn()}
        onManualEntry={onManualEntry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(onManualEntry).toHaveBeenCalledTimes(1);
  });

  it("без onManualEntry лишається закриттям — у комори ручний ввід поруч", () => {
    const onDismiss = vi.fn();
    render(<BarcodeLookupNotice kind="not-found" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
