// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutsHome, RecentWorkoutSummary } from "./WorkoutsHome";

const NOW = "2026-07-01T10:00:00.000Z";

function baseHandlers() {
  return {
    onOpenSession: vi.fn(),
    onOpenCatalog: vi.fn(),
    onOpenTemplates: vi.fn(),
    onOpenJournal: vi.fn(),
    onRequestStart: vi.fn(),
    onOpenRetro: vi.fn(),
  };
}

describe("WorkoutsHome", () => {
  beforeEach(cleanup);

  it("shows the active-workout card with duration and item count when a workout is in flight", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{
          id: "w1",
          startedAt: NOW,
          endedAt: null,
          items: [{ a: 1 }, { b: 2 }],
        }}
        activeDuration="12:34"
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(screen.getByText("Активне тренування")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toBeInTheDocument();
    expect(screen.getByText(/2 вправ/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Відкрити/ }));
    expect(handlers.onOpenSession).toHaveBeenCalledTimes(1);
  });

  it("defaults the active duration display to 00:00 when activeDuration is null", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{ id: "w1", startedAt: NOW, endedAt: null, items: [] }}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("treats an ended workout as inactive and shows the empty-active state", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{ id: "w1", startedAt: NOW, endedAt: NOW, items: [] }}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.getByText("Немає активного тренування")).toBeInTheDocument();
  });

  it("shows the empty-active state with start / retro CTAs when there is no active workout", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(screen.getByText("Немає активного тренування")).toBeInTheDocument();
    // No schedule CTA when onOpenSchedule isn't provided.
    expect(
      screen.queryByText("Запланувати тренування"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Почати тренування"));
    expect(handlers.onRequestStart).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/Внести проведене/));
    expect(handlers.onOpenRetro).toHaveBeenCalledTimes(1);
  });

  it("shows the schedule CTA when onOpenSchedule is provided and calls it on click", () => {
    const handlers = baseHandlers();
    const onOpenSchedule = vi.fn();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        onOpenSchedule={onOpenSchedule}
        {...handlers}
      />,
    );

    const scheduleBtn = screen.getByText(/Запланувати тренування/);
    fireEvent.click(scheduleBtn);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-journal placeholder and hides the 'Всі →' link when recentWorkouts is empty", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(
      screen.getByText(/тут з'являться останні|тут з&apos;являться останні/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Всі →")).not.toBeInTheDocument();
  });

  it("renders the recent-workouts list and the 'Всі →' link, wiring both to onOpenJournal", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[
          { id: "r1", startedAt: NOW, endedAt: NOW, items: [] },
          { id: "r2", startedAt: NOW, endedAt: null, items: [] },
        ]}
        {...handlers}
      />,
    );

    const allLink = screen.getByText("Всі →");
    fireEvent.click(allLink);
    expect(handlers.onOpenJournal).toHaveBeenCalledTimes(1);

    const listButtons = screen.getAllByRole("listitem");
    expect(listButtons).toHaveLength(2);
    fireEvent.click(listButtons[0]!.querySelector("button")!);
    expect(handlers.onOpenJournal).toHaveBeenCalledTimes(2);
  });

  it("hides the Програми tile when onOpenPrograms is not provided", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.queryByText("Програми")).not.toBeInTheDocument();
  });

  it("shows the Програми tile and calls onOpenPrograms / onOpenCatalog / onOpenTemplates on click", () => {
    const handlers = baseHandlers();
    const onOpenPrograms = vi.fn();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        onOpenPrograms={onOpenPrograms}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByText("Каталог вправ"));
    expect(handlers.onOpenCatalog).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Шаблони"));
    expect(handlers.onOpenTemplates).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Програми"));
    expect(onOpenPrograms).toHaveBeenCalledTimes(1);
  });
});

describe("RecentWorkoutSummary", () => {
  beforeEach(cleanup);

  it("shows the Чернетка badge and 'порожнє тренування' subtitle for an unfinished, itemless workout", () => {
    render(
      <RecentWorkoutSummary
        workout={{ id: "w1", startedAt: NOW, endedAt: null, items: [] }}
      />,
    );
    expect(screen.getByText("Чернетка")).toBeInTheDocument();
    expect(screen.getByText("порожнє тренування")).toBeInTheDocument();
  });

  it("omits the Чернетка badge and builds a joined subtitle for a finished workout with items/sets/duration", () => {
    const started = "2026-07-01T10:00:00.000Z";
    const ended = "2026-07-01T10:45:00.000Z"; // 45 min later
    render(
      <RecentWorkoutSummary
        workout={{
          id: "w1",
          startedAt: started,
          endedAt: ended,
          items: [
            {
              type: "strength",
              sets: [
                { weightKg: 50, reps: 8 },
                { weightKg: 50, reps: 8 },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText("Чернетка")).not.toBeInTheDocument();
    expect(screen.getByText(/1 вправ/)).toBeInTheDocument();
    expect(screen.getByText(/2 сетів/)).toBeInTheDocument();
    expect(screen.getByText(/45 хв/)).toBeInTheDocument();
  });
});
