// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { Habit, RoutineState } from "../../lib/types";
import { ArchivedHabitsSection } from "./ArchivedHabitsSection";

vi.mock("@shared/lib/storage/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/storage/storage")
  >("@shared/lib/storage/storage");
  return {
    ...actual,
    safeWriteLS: () => true,
    safeReadLS: () => null,
    safeReadStringLS: () => null,
  };
});

function makeArchivedHabit(id: string, name: string): Habit {
  return {
    id,
    name,
    emoji: "📦",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: true,
  } as Habit;
}

afterEach(cleanup);

describe("ArchivedHabitsSection", () => {
  it("renders nothing when there are no archived habits", () => {
    const { container } = render(
      <ArchivedHabitsSection
        routine={defaultRoutineState()}
        setRoutine={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists archived habits and wires restore/delete actions", () => {
    const habit = makeArchivedHabit("h-arch", "Стара звичка");
    const routine: RoutineState = {
      ...defaultRoutineState(),
      habits: [habit],
      habitOrder: [habit.id],
    };
    const onRequestDelete = vi.fn();
    const setRoutine = vi.fn();
    render(
      <ArchivedHabitsSection
        routine={routine}
        setRoutine={setRoutine}
        onRequestDelete={onRequestDelete}
      />,
    );
    expect(screen.getByText("Архів")).toBeInTheDocument();
    expect(screen.getByText(/Стара звичка/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Відновити" }));
    expect(setRoutine).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: "h-arch",
      name: "Стара звичка",
      archived: true,
    });
  });
});
