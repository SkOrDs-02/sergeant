// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LogPastWorkoutSheet } from "./LogPastWorkoutSheet";

function setup(overrides: Partial<{ open: boolean }> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(
    <LogPastWorkoutSheet
      open={overrides.open ?? true}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
  return { onClose, onSubmit };
}

function field(name: string): HTMLInputElement {
  return screen.getByLabelText(name) as HTMLInputElement;
}

describe("LogPastWorkoutSheet", () => {
  beforeEach(cleanup);

  it("нічого не рендерить, поки закрита", () => {
    const { container } = render(
      <LogPastWorkoutSheet open={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("віддає обидві мітки — і початок, і кінець", () => {
    // Власне те, чого бракувало: стара форма питала лише початок, а поле
    // кінця в `WorkoutTimeEditor` зʼявляється аж після завершення.
    const { onSubmit } = setup();
    fireEvent.change(field("Дата"), { target: { value: "2026-08-09" } });
    fireEvent.change(field("Початок"), { target: { value: "18:00" } });
    fireEvent.change(field("Завершення"), { target: { value: "19:30" } });
    fireEvent.click(screen.getByText("Внести й додати вправи"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as {
      startedAt: string;
      endedAt: string;
    };
    expect(Date.parse(arg.endedAt) - Date.parse(arg.startedAt)).toBe(
      90 * 60_000,
    );
  });

  it("не дає обрати майбутню дату", () => {
    // Тренування «проведене» за визначенням не може бути завтра.
    setup();
    expect(field("Дата").max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("попереджає, коли сесія переповзає за північ", () => {
    // Мовчазне +1 доба — саме той клас поведінки, через який людина потім
    // не розуміє, звідки в журналі взявся інший день.
    setup();
    fireEvent.change(field("Початок"), { target: { value: "23:40" } });
    fireEvent.change(field("Завершення"), { target: { value: "00:20" } });
    expect(screen.getByText("Завершення — наступного дня.")).toBeVisible();
  });

  it("не показує попередження для звичайної денної сесії", () => {
    setup();
    fireEvent.change(field("Початок"), { target: { value: "10:00" } });
    fireEvent.change(field("Завершення"), { target: { value: "11:00" } });
    expect(screen.queryByText("Завершення — наступного дня.")).toBeNull();
  });

  it("блокує кнопку, доки ввід неповний", () => {
    const { onSubmit } = setup();
    fireEvent.change(field("Завершення"), { target: { value: "" } });
    const submit = screen.getByText("Внести й додати вправи");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("закривається хрестиком", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByLabelText("Закрити"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
