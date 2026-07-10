// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Habit } from "../../lib/types";
import { HabitListItem } from "./HabitListItem";

function makeHabit(): Habit {
  return {
    id: "h1",
    name: "Медитація",
    emoji: "🧘",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    timeOfDay: "08:00",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as Habit;
}

const noopDrag = vi.fn();

afterEach(cleanup);

describe("HabitListItem", () => {
  it("renders habit metadata and action buttons", () => {
    render(
      <ul>
        <HabitListItem
          habit={makeHabit()}
          editing={false}
          dragging={false}
          onDragStart={noopDrag}
          onDragEnd={noopDrag}
          onDragOver={noopDrag}
          onDrop={noopDrag}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          onOpenDetails={vi.fn()}
          onStartEdit={vi.fn()}
          onArchive={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText(/Медитація/)).toBeInTheDocument();
    expect(screen.getByText(/Щодня/)).toBeInTheDocument();
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
  });

  it("forwards row actions to callbacks", () => {
    const onOpenDetails = vi.fn();
    const onArchive = vi.fn();
    render(
      <ul>
        <HabitListItem
          habit={makeHabit()}
          editing={false}
          dragging={false}
          onDragStart={noopDrag}
          onDragEnd={noopDrag}
          onDragOver={noopDrag}
          onDrop={noopDrag}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          onOpenDetails={onOpenDetails}
          onStartEdit={vi.fn()}
          onArchive={onArchive}
          onRequestDelete={vi.fn()}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Деталі" }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "В архів" }));
    expect(onArchive).toHaveBeenCalledOnce();
  });
});
