// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Habit } from "../../lib/types";
import { HabitListItem } from "./HabitListItem";

function makeHabit(): Habit {
  return {
    id: "h1",
    name: "Вода",
    emoji: "💧",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    timeOfDay: "08:00",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as Habit;
}

describe("HabitListItem", () => {
  afterEach(cleanup);

  it("renders habit meta and action buttons", () => {
    const onOpenDetails = vi.fn();
    render(
      <HabitListItem
        habit={makeHabit()}
        editing={false}
        dragging={false}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onOpenDetails={onOpenDetails}
        onStartEdit={vi.fn()}
        onArchive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/Вода/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Деталі" }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("wires reorder and delete callbacks", () => {
    const onMoveUp = vi.fn();
    const onRequestDelete = vi.fn();
    render(
      <HabitListItem
        habit={makeHabit()}
        editing={true}
        dragging={true}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onMoveUp={onMoveUp}
        onMoveDown={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartEdit={vi.fn()}
        onArchive={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вгору в списку" }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });
});
