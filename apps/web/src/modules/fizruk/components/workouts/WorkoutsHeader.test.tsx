// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain";
import { WorkoutsHeader } from "./WorkoutsHeader";

function baseWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w-1",
    startedAt: "2026-07-01T10:00:00.000Z",
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...overrides,
  } as Workout;
}

describe("WorkoutsHeader", () => {
  beforeEach(cleanup);

  it("shows the plain 'Тренування' title with no back button on the home view", () => {
    render(
      <WorkoutsHeader
        view="home"
        activeWorkout={null}
        finishedCount={0}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText("Тренування")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Повернутись до тренувань" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Перше тренування — попереду")).toBeInTheDocument();
  });

  it("shows the 'Завершено: N' subtitle on home when finishedCount > 0 and no active workout", () => {
    render(
      <WorkoutsHeader
        view="home"
        activeWorkout={null}
        finishedCount={3}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText("Завершено: 3")).toBeInTheDocument();
  });

  it("shows the active-workout subtitle on home when a workout is in flight", () => {
    render(
      <WorkoutsHeader
        view="home"
        activeWorkout={baseWorkout({ items: [{}, {}] as never })}
        finishedCount={5}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText(/Активне · 2 вправ/)).toBeInTheDocument();
  });

  it("titles the catalog view and shows the + Додати button, wired to onAddCatalog", () => {
    const onAddCatalog = vi.fn();
    render(
      <WorkoutsHeader
        view="catalog"
        activeWorkout={null}
        finishedCount={0}
        onBack={vi.fn()}
        onAddCatalog={onAddCatalog}
      />,
    );
    expect(screen.getByText("Каталог вправ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Додати/ }));
    expect(onAddCatalog).toHaveBeenCalledTimes(1);
  });

  it("titles the templates view without the + Додати button", () => {
    render(
      <WorkoutsHeader
        view="templates"
        activeWorkout={null}
        finishedCount={0}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText("Шаблони")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Додати/ }),
    ).not.toBeInTheDocument();
  });

  it("titles the log view 'Активне тренування' when a workout is in flight", () => {
    render(
      <WorkoutsHeader
        view="log"
        activeWorkout={baseWorkout()}
        finishedCount={0}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText("Активне тренування")).toBeInTheDocument();
  });

  it("titles the log view 'Журнал' when there is no active workout", () => {
    render(
      <WorkoutsHeader
        view="log"
        activeWorkout={baseWorkout({ endedAt: "2026-07-01T11:00:00.000Z" })}
        finishedCount={0}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.getByText("Журнал")).toBeInTheDocument();
  });

  it("renders the back button on non-home views and wires it to onBack", () => {
    const onBack = vi.fn();
    render(
      <WorkoutsHeader
        view="log"
        activeWorkout={null}
        finishedCount={0}
        onBack={onBack}
        onAddCatalog={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Повернутись до тренувань" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not show the home subtitle paragraph on non-home views", () => {
    render(
      <WorkoutsHeader
        view="log"
        activeWorkout={null}
        finishedCount={7}
        onBack={vi.fn()}
        onAddCatalog={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Завершено: 7/)).not.toBeInTheDocument();
  });
});
