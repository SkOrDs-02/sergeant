// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

function makeArchivedHabit(): Habit {
  return {
    id: "arch-1",
    name: "Старе",
    emoji: "📦",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: true,
  } as Habit;
}

describe("ArchivedHabitsSection", () => {
  afterEach(cleanup);

  it("returns null when no archived habits exist", () => {
    const { container } = render(
      <ArchivedHabitsSection
        routine={defaultRoutineState()}
        setRoutine={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("restores archived habit and requests delete", () => {
    const onRequestDelete = vi.fn();
    const archived = makeArchivedHabit();
    const routine: RoutineState = {
      ...defaultRoutineState(),
      habits: [archived],
      habitOrder: ["arch-1"],
    };

    render(
      <ArchivedHabitsSection
        routine={routine}
        setRoutine={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    );

    expect(screen.getByText("Архів")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: "arch-1",
      name: "Старе",
      archived: true,
    });
  });
});
