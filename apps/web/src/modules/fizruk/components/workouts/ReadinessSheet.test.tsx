/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-02
 * Status: Active
 *
 * Аркуш готовності. Крім поведінки, цей файл стереже САМЕ ТІ локатори, якими
 * аркуш дістає smoke-тест `fizruk-active-workout.spec.ts`: доступне імʼя
 * діалогу і напис на кнопці пропуску. Аркуш перекриває сторінку, тож зміна
 * будь-якого з них ламає критичний потік у CI, а не лише цей компонент —
 * і саме так фіча його один раз уже зламала.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ReadinessSheet } from "./ReadinessSheet";

afterEach(cleanup);

describe("ReadinessSheet", () => {
  it("закритий аркуш не рендерить нічого", () => {
    const { container } = render(
      <ReadinessSheet open={false} onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("дає діалог із тим самим доступним імʼям, що чекає smoke-тест", () => {
    render(<ReadinessSheet open onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(
      screen.getByRole("dialog", { name: "Як ти сьогодні?" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Пропустити" })).toBeTruthy();
  });

  it("віддає обидві оцінки", () => {
    const onSubmit = vi.fn();
    render(<ReadinessSheet open onSubmit={onSubmit} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Як спалось? 2" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Як почуваються мʼязи? 5" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(onSubmit).toHaveBeenCalledWith({ sleep: 2, soreness: 5 });
  });

  it("порожня відповідь дозволена і дорівнює «нема даних»", () => {
    const onSubmit = vi.fn();
    render(<ReadinessSheet open onSubmit={onSubmit} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    // `null`, а не `0` і не дефолт: домен читає це як відсутність даних, тож
    // мовчання не класифікується ані як «погано», ані як «добре».
    expect(onSubmit).toHaveBeenCalledWith({ sleep: null, soreness: null });
  });

  it("часткова відповідь віддається як є", () => {
    const onSubmit = vi.fn();
    render(<ReadinessSheet open onSubmit={onSubmit} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Як спалось? 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(onSubmit).toHaveBeenCalledWith({ sleep: 1, soreness: null });
  });

  it("кнопки шкали тримають 44px floor", () => {
    render(<ReadinessSheet open onSubmit={vi.fn()} onSkip={vi.fn()} />);
    const scaleButton = screen.getByRole("button", { name: "Як спалось? 3" });
    expect(scaleButton.className).toContain("min-w-[44px]");
    expect(scaleButton.className).toContain("min-h-[44px]");
  });
});
