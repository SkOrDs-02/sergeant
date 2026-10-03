// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HabitPauseSection } from "./HabitPauseSection";
import type { Habit } from "../lib/types";

const pauseHabitBetween = vi.fn((s: unknown) => s);
const resumeHabitFrom = vi.fn((s: unknown) => s);

vi.mock("../lib/routineStorage", () => ({
  pauseHabitBetween: (...a: unknown[]) => pauseHabitBetween(...(a as [never])),
  resumeHabitFrom: (...a: unknown[]) => resumeHabitFrom(...(a as [never])),
}));

const TODAY = "2026-08-02";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Зарядка",
    recurrence: "daily",
    startDate: "2026-01-01",
    ...overrides,
  };
}

/** `setRoutine` тут — просто виконавець updater-а: перевіряємо, ЩО викликано. */
const runUpdater = (fn: unknown) => {
  (fn as (s: unknown) => unknown)({});
};

beforeEach(() => {
  pauseHabitBetween.mockClear();
  resumeHabitFrom.mockClear();
});
afterEach(cleanup);

describe("HabitPauseSection", () => {
  it("заявляє датовану паузу з обома межами", () => {
    render(
      <HabitPauseSection
        habit={habit()}
        todayKey={TODAY}
        setRoutine={runUpdater as never}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^З/), {
      target: { value: "2026-08-10" },
    });
    fireEvent.change(screen.getByLabelText(/^По/), {
      target: { value: "2026-08-17" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Поставити паузу" }));

    expect(pauseHabitBetween).toHaveBeenCalledWith(
      expect.anything(),
      "h1",
      "2026-08-10",
      "2026-08-17",
    );
  });

  it("порожня друга межа їде як відкритий інтервал", () => {
    render(
      <HabitPauseSection
        habit={habit()}
        todayKey={TODAY}
        setRoutine={runUpdater as never}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Поставити паузу" }));
    expect(pauseHabitBetween).toHaveBeenCalledWith(
      expect.anything(),
      "h1",
      TODAY,
      null,
    );
  });

  it("складає дати у мобільну колонку без взаємного накладання", () => {
    render(
      <HabitPauseSection
        habit={habit()}
        todayKey={TODAY}
        setRoutine={runUpdater as never}
      />,
    );

    const dateGroup = screen.getByRole("group", { name: "Пауза" });
    expect(dateGroup).toHaveClass("grid", "min-w-0", "grid-cols-1");
    expect(dateGroup).toHaveClass("sm:grid-cols-2");

    for (const input of [
      screen.getByLabelText(/^З/),
      screen.getByLabelText(/^По/),
    ]) {
      expect(input).toHaveClass("min-w-0", "max-w-full");
      expect(input).toHaveClass("[min-inline-size:0]", "[inline-size:100%]");
    }
  });

  it("активна пауза показує межі й пропонує повернутись", () => {
    render(
      <HabitPauseSection
        habit={habit({
          pauseIntervals: [{ from: "2026-08-01", to: "2026-08-09" }],
        })}
        todayKey={TODAY}
        setRoutine={runUpdater as never}
      />,
    );

    expect(
      screen.getByText("На паузі 01.08.2026 – 09.08.2026"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Повернутись сьогодні" }),
    );
    expect(resumeHabitFrom).toHaveBeenCalledWith(
      expect.anything(),
      "h1",
      TODAY,
    );
  });

  it("майбутня пауза показана окремо, а форма лишається доступною", () => {
    render(
      <HabitPauseSection
        habit={habit({
          pauseIntervals: [{ from: "2026-09-01", to: "2026-09-07" }],
        })}
        todayKey={TODAY}
        setRoutine={runUpdater as never}
      />,
    );
    expect(
      screen.getByText("Заплановано: 01.09.2026 – 07.09.2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Поставити паузу" }),
    ).toBeInTheDocument();
  });
});
