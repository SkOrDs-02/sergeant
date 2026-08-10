// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LogPastWorkoutSheet } from "./LogPastWorkoutSheet";

/**
 * Годинник запнутий: форма порівнює введений кінець із `Date.now()`, тож без
 * піна «майбутня дата» перестала б бути майбутньою, щойно календар до неї
 * дійде, і тест тихо став би вакуумним замість того, щоб впасти.
 */
const NOW = new Date("2026-08-09T09:00:00Z");
/** Свідомо давня доба — минула в будь-якій зоні раннера. */
const PAST_DAY = "2026-08-01";

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
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
    fireEvent.change(field("Дата"), { target: { value: PAST_DAY } });
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
    fireEvent.change(field("Дата"), { target: { value: PAST_DAY } });
    fireEvent.change(field("Початок"), { target: { value: "23:40" } });
    fireEvent.change(field("Завершення"), { target: { value: "00:20" } });
    expect(screen.getByText("Завершення — наступного дня.")).toBeVisible();
  });

  it("не показує попередження для звичайної денної сесії", () => {
    setup();
    fireEvent.change(field("Дата"), { target: { value: PAST_DAY } });
    fireEvent.change(field("Початок"), { target: { value: "10:00" } });
    fireEvent.change(field("Завершення"), { target: { value: "11:00" } });
    expect(screen.queryByText("Завершення — наступного дня.")).toBeNull();
  });

  it("не пускає майбутню дату, навіть якщо `max` обійшли", () => {
    // `max` — підказка пікера, а не гейт: значення можна виставити програмно
    // (автозаповнення, вставка, зміна годинника пристрою). Завершене
    // тренування «завтра» потрапило б у стрік і статистику за день, якого
    // ще не було.
    const { onSubmit } = setup();
    fireEvent.change(field("Дата"), { target: { value: "2026-08-20" } });
    const submit = screen.getByText("Внести й додати вправи");
    expect(screen.getByText(/Завершення ще не настало/)).toBeVisible();
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("не пускає майбутній ЧАС у межах сьогоднішньої доби", () => {
    // Того `max` не бачить узагалі: доба та сама.
    const { onSubmit } = setup();
    fireEvent.change(field("Початок"), { target: { value: "08:00" } });
    fireEvent.change(field("Завершення"), { target: { value: "23:59" } });
    const submit = screen.getByText("Внести й додати вправи");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("майбутній підпис витісняє нейтральний «наступного дня»", () => {
    // Сесія через північ на сьогоднішній даті — обидва стани разом. Показувати
    // два підписи означало б залишити людину гадати, який із них блокує кнопку.
    setup();
    fireEvent.change(field("Початок"), { target: { value: "02:00" } });
    fireEvent.change(field("Завершення"), { target: { value: "01:00" } });
    expect(screen.getByText(/Завершення ще не настало/)).toBeVisible();
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
