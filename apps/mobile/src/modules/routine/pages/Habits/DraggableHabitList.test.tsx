/**
 * Jest tests for `DraggableHabitList` (Phase 5 — habit drag-reorder).
 *
 * Covers both layers of the feature:
 *  - Pure helpers (`computeDropIndex`, `moveInArray`) which the drag
 *    gesture callback leans on to decide where to drop a row. These
 *    are exercised in isolation because the worklet boundary makes
 *    them easier to assert as plain functions than via a simulated
 *    drag.
 *  - Gesture integration: a `<DraggableHabitList>` tree is rendered,
 *    the per-row Pan gesture is looked up via
 *    `getByGestureTestId`, then fired through
 *    `react-native-gesture-handler/jest-utils`' `fireGestureHandler`
 *    with `BEGAN → ACTIVE → END` lifecycle. On END we expect
 *    `onReorder` to be called with the new ordered id list.
 *
 * The ↑ / ↓ accessibility-fallback buttons are tested to confirm they
 * still fire through the supplied callbacks — the drag UX is additive,
 * not a replacement.
 */

import type { Habit } from "@sergeant/routine-domain";
import { AccessibilityInfo } from "react-native";
import { State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import {
  DraggableHabitList,
  computeDropIndex,
  moveInArray,
} from "./DraggableHabitList";

/**
 * `runOnJS` from `react-native-reanimated` defers the JS-thread hop
 * through `queueMicrotask`, so `fireGestureHandler(...)` returns before
 * our `onDragEnd` callback actually runs. Awaiting a microtask inside
 * `act()` flushes that queue and also lets React commit the
 * `setDraggingId(null)` state update triggered by the drop.
 */
async function flushGestureQueue(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function h(id: string, name?: string): Habit {
  return { id, name: name ?? id };
}

function renderList(
  habits: Habit[],
  overrides?: Partial<{
    onReorder: (ids: string[]) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
  }>,
) {
  const onReorder = overrides?.onReorder ?? jest.fn();
  const onMoveUp = overrides?.onMoveUp ?? jest.fn();
  const onMoveDown = overrides?.onMoveDown ?? jest.fn();
  const onStartEdit = jest.fn();
  const onArchive = jest.fn();
  const onRequestDelete = jest.fn();

  const utils = render(
    <DraggableHabitList
      habits={habits}
      onReorder={onReorder}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onStartEdit={onStartEdit}
      onArchive={onArchive}
      onRequestDelete={onRequestDelete}
      editingId={null}
      pendingDeleteId={null}
      testID="habits"
    />,
  );

  return {
    ...utils,
    onReorder,
    onMoveUp,
    onMoveDown,
    onStartEdit,
    onArchive,
    onRequestDelete,
  };
}

beforeEach(() => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DraggableHabitList — pure helpers", () => {
  it("moveInArray moves an element forward", () => {
    expect(moveInArray(["a", "b", "c", "d"], 0, 2)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("moveInArray moves an element backward", () => {
    expect(moveInArray(["a", "b", "c", "d"], 3, 1)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("moveInArray is a no-op when from === to", () => {
    const input = ["a", "b", "c"];
    const output = moveInArray(input, 1, 1);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("computeDropIndex returns fromIndex when translation is zero", () => {
    expect(computeDropIndex(1, 0, [80, 80, 80, 80])).toBe(1);
  });

  it("computeDropIndex steps down when the finger crosses half of the next row", () => {
    // Dragging row 0 (height 80) down by 50 px only crosses half of row 1
    // (= 40 px), so we land at index 1.
    expect(computeDropIndex(0, 50, [80, 80, 80, 80])).toBe(1);
  });

  it("computeDropIndex does not step when translation is below the half-height", () => {
    // 30 px is less than half of row 1 (40 px), so we stay put.
    expect(computeDropIndex(0, 30, [80, 80, 80, 80])).toBe(0);
  });

  it("computeDropIndex walks over multiple rows with variable heights", () => {
    // Move row 0 past rows 1 (h=60) and 2 (h=80): need to consume 60 + 40.
    // Translation of 110 crosses 60 + 40 = 100 but not 60 + 80 + 30 = 170,
    // so we land at index 2.
    expect(computeDropIndex(0, 110, [80, 60, 80, 80])).toBe(2);
  });

  it("computeDropIndex steps up with negative translations", () => {
    expect(computeDropIndex(3, -50, [80, 80, 80, 80])).toBe(2);
    expect(computeDropIndex(3, -130, [80, 80, 80, 80])).toBe(1);
  });

  it("computeDropIndex clamps to the list boundaries", () => {
    expect(computeDropIndex(0, 10000, [80, 80, 80])).toBe(2);
    expect(computeDropIndex(2, -10000, [80, 80, 80])).toBe(0);
  });
});

describe("DraggableHabitList — gesture integration", () => {
  it("renders each habit row with the accessibility-fallback ↑ / ↓ buttons", () => {
    renderList([h("a", "Йога"), h("b", "Біг"), h("c", "Читання")]);

    expect(screen.getByText("Йога")).toBeTruthy();
    expect(screen.getByText("Біг")).toBeTruthy();
    expect(screen.getByText("Читання")).toBeTruthy();
    // Every row exposes both arrow buttons so screen-reader users keep
    // a keyboard-accessible reorder path even without the drag gesture.
    expect(screen.getAllByLabelText("Вгору в списку")).toHaveLength(3);
    expect(screen.getAllByLabelText("Вниз в списку")).toHaveLength(3);
  });

  it("forwards ↑ / ↓ button presses to the store callbacks", () => {
    const { onMoveUp, onMoveDown } = renderList([h("a"), h("b"), h("c")]);

    const upButtons = screen.getAllByLabelText("Вгору в списку");
    const downButtons = screen.getAllByLabelText("Вниз в списку");

    fireEvent.press(upButtons[1]);
    fireEvent.press(downButtons[0]);

    expect(onMoveUp).toHaveBeenCalledWith("b");
    expect(onMoveDown).toHaveBeenCalledWith("a");
  });

  it("calls onReorder with the moved id list when a row is dragged to a new slot", async () => {
    const { onReorder } = renderList([h("a"), h("b"), h("c"), h("d")]);

    // Pan gesture attached to row "a" — dragging it 200 px down must
    // slot it past b and c (two rows × ~92 px fallback height ≈ 184 px,
    // so 200 clears the midpoint of c as well).
    fireGestureHandler(getByGestureTestId("habits-row-a-drag"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 50 },
      { state: State.ACTIVE, translationY: 200 },
      { state: State.END, translationY: 200 },
    ]);
    await flushGestureQueue();

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a", "d"]);
  });

  it("does not fire onReorder when the drag translation stays within a single row", async () => {
    const { onReorder } = renderList([h("a"), h("b"), h("c")]);

    fireGestureHandler(getByGestureTestId("habits-row-b-drag"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 10 },
      { state: State.END, translationY: 10 },
    ]);
    await flushGestureQueue();

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("supports upward drags — dragging row 'c' over rows 'b' and 'a'", async () => {
    const { onReorder } = renderList([h("a"), h("b"), h("c"), h("d")]);

    fireGestureHandler(getByGestureTestId("habits-row-c-drag"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: -200 },
      { state: State.END, translationY: -200 },
    ]);
    await flushGestureQueue();

    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b", "d"]);
  });
});
