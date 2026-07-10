/** @vitest-environment jsdom */
/**
 * Unit tests for HabitLeadersBlock.
 *
 * The component uses habitCompletionRate + getKyivDayKey internally; we mock
 * both so tests are deterministic regardless of real wall-clock time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Habit, RoutineState } from "../lib/types";

// Deterministic "today" anchored to 2026-07-10 (Kyiv = UTC+3, 12:00 local).
const FIXED_NOW = new Date("2026-07-10T09:00:00Z");

vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: (ms?: number) => {
    const d = ms !== undefined ? new Date(ms) : FIXED_NOW;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  },
}));

// habitCompletionRate: returns rate=1 for habit "h1", rate=0.5 for "h2",
// rate=0.2 for "h3" — good enough to drive best/worst branches.
vi.mock("../lib/streaks", () => ({
  habitCompletionRate: (
    habit: Habit,
    _completions: string[],
    _start: string,
    _end: string,
  ) => {
    const map: Record<
      string,
      { completed: number; scheduled: number; rate: number }
    > = {
      h1: { completed: 10, scheduled: 10, rate: 1 },
      h2: { completed: 5, scheduled: 10, rate: 0.5 },
      h3: { completed: 2, scheduled: 10, rate: 0.2 },
    };
    return map[habit.id] ?? { completed: 0, scheduled: 0, rate: 0 };
  },
}));

import { HabitLeadersBlock } from "./HabitLeadersBlock";

function makeHabit(id: string, name: string, archived = false): Habit {
  return { id, name, archived } as Habit;
}

type Completions = RoutineState["completions"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("HabitLeadersBlock", () => {
  it("renders nothing when habits array is empty", () => {
    const { container } = render(
      <HabitLeadersBlock habits={[]} completions={{} as Completions} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when all habits are archived", () => {
    const habits = [makeHabit("h1", "Архівована", true)];
    const { container } = render(
      <HabitLeadersBlock habits={habits} completions={{} as Completions} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when habits have zero scheduled days in the window", () => {
    // habitCompletionRate will be mocked to return rate=0 for unknown ids
    const habits = [makeHabit("unknown", "Без плану")];
    const { container } = render(
      <HabitLeadersBlock habits={habits} completions={{} as Completions} />,
    );
    // scheduled=0 → filtered out → best=null → null render
    expect(container.firstChild).toBeNull();
  });

  it("shows best habit but no worst when only one habit has scheduled days", () => {
    const habits = [makeHabit("h1", "Вода")];
    render(
      <HabitLeadersBlock
        habits={habits}
        completions={{ h1: [] } as unknown as Completions}
      />,
    );
    expect(screen.getByText("Найстабільніша")).toBeInTheDocument();
    expect(screen.queryByText("Найслабша")).not.toBeInTheDocument();
    expect(screen.getByText(/Вода/)).toBeInTheDocument();
    // Rate 100%
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it("shows both best and worst when two or more habits have different rates", () => {
    const habits = [makeHabit("h1", "Вода"), makeHabit("h2", "Спорт")];
    const completions = { h1: [], h2: [] } as unknown as Completions;
    render(<HabitLeadersBlock habits={habits} completions={completions} />);

    expect(screen.getByText("Найстабільніша")).toBeInTheDocument();
    expect(screen.getByText("Найслабша")).toBeInTheDocument();

    // h1 is best (rate=1 → 100%), h2 is worst (rate=0.5 → 50%)
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("hides worst card when best and worst happen to be the same habit (single active)", () => {
    // With a single habit, worst === best; component guards against that.
    const habits = [makeHabit("h1", "Читання")];
    const completions = { h1: [] } as unknown as Completions;
    render(<HabitLeadersBlock habits={habits} completions={completions} />);

    expect(screen.getByText("Найстабільніша")).toBeInTheDocument();
    expect(screen.queryByText("Найслабша")).not.toBeInTheDocument();
  });

  it("renders the section heading 'Лідери та аутсайдери (30 днів)'", () => {
    const habits = [makeHabit("h1", "Медитація")];
    const completions = { h1: [] } as unknown as Completions;
    render(<HabitLeadersBlock habits={habits} completions={completions} />);
    expect(
      screen.getByText("Лідери та аутсайдери (30 днів)"),
    ).toBeInTheDocument();
  });

  it("skips archived habits while still showing non-archived ones", () => {
    const habits = [
      makeHabit("h1", "Активна"),
      makeHabit("h2", "Архівована", true),
    ];
    const completions = { h1: [], h2: [] } as unknown as Completions;
    render(<HabitLeadersBlock habits={habits} completions={completions} />);
    // Only h1 is active → shows best, no worst
    expect(screen.getByText("Найстабільніша")).toBeInTheDocument();
    expect(screen.queryByText("Найслабша")).not.toBeInTheDocument();
    expect(screen.getByText(/Активна/)).toBeInTheDocument();
  });
});
