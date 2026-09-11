// @vitest-environment jsdom
/**
 * SessionView — оркестратор сесійного режиму. Покриває перемикання
 * «список ↔ вправа» за `focusItemId`, «+ Вправа», стрілки на сусідні
 * вправи, два стани дока (дії / таймер), вибір для суперсету через ⋯ і
 * undo для видаленого підходу.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { RestTimerContext } from "../../context/RestTimerContext";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { SessionView } from "./SessionView";

const undoMocks = vi.hoisted(() => ({
  last: null as null | { msg: string; onUndo: () => void },
}));
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: (
    _toast: unknown,
    opts: { msg: string; onUndo: () => void },
  ) => {
    undoMocks.last = opts;
    return 1;
  },
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, useVisualKeyboardInset: () => 0 };
});

function item(
  id: string,
  name: string,
  sets: Array<[number, number]>,
): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameUk: name,
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })),
  } as WorkoutItem;
}

function workout(over: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-09-11T10:00:00Z",
    endedAt: null,
    note: "",
    warmup: null,
    cooldown: null,
    groups: [],
    items: [
      item("a", "Жим лежачи", [[80, 8]]),
      item("b", "Присідання", [[0, 0]]),
      item("c", "Тяга штанги", []),
    ],
    ...over,
  } as Workout;
}

const updateItem = vi.fn();
const updateWorkout = vi.fn();
const removeItem = vi.fn();
const onFinishClick = vi.fn();
const onDeleteWorkout = vi.fn();
const onCollapse = vi.fn();
const onOpenItem = vi.fn();
const onAddExercise = vi.fn();

function renderView(
  props: Partial<React.ComponentProps<typeof SessionView>> = {},
  restTimer: RestTimerState | null = null,
) {
  const setRestTimer = vi.fn() as unknown as Dispatch<
    SetStateAction<RestTimerState | null>
  >;
  const w = props.activeWorkout ?? workout();
  render(
    <ToastProvider>
      <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
        <SessionView
          activeWorkout={w}
          activeDuration="12:34"
          lastByExerciseId={{}}
          recBy={{}}
          removeItem={removeItem}
          updateItem={updateItem}
          updateWorkout={updateWorkout}
          onFinishClick={onFinishClick}
          onDeleteWorkout={onDeleteWorkout}
          onCollapse={onCollapse}
          onOpenItem={onOpenItem}
          onAddExercise={onAddExercise}
          {...props}
        />
      </RestTimerContext.Provider>
    </ToastProvider>,
  );
  return { setRestTimer };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionView — list", () => {
  it("renders the exercise list with states, the hero duration and the progress line", () => {
    renderView();
    expect(
      screen.getByRole("timer", { name: "Тривалість тренування" }),
    ).toHaveTextContent("12:34");
    expect(screen.getByText(/1 з 3/)).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /Відкрити вправу:/ });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
  });

  it("opens an exercise on row tap and collapses via the top bar", () => {
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити вправу: Присідання" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "Згорнути" }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it("«+ Вправа» in the list and in the dock both open the catalog", () => {
    renderView();
    for (const btn of screen.getAllByRole("button", {
      name: "Додати вправу",
    })) {
      fireEvent.click(btn);
    }
    expect(onAddExercise).toHaveBeenCalledTimes(2);
  });

  it("renders the empty state with an add button when there are no items", () => {
    renderView({ activeWorkout: workout({ items: [] }) });
    expect(screen.getByText("Поки без вправ")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Додати вправу" }).length,
    ).toBeGreaterThan(0);
  });

  it("finishes from the top bar and from the bottom button", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Завершити" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Завершити тренування" }),
    );
    expect(onFinishClick).toHaveBeenCalledTimes(2);
  });

  it("groups two selected items into a superset from the ⋯ menu", () => {
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Обʼєднати в суперсет" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Жим лежачи/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Присідання/ }));
    fireEvent.click(screen.getByRole("button", { name: /Суперсет \(2\/3\)/ }));
    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      groups: [
        expect.objectContaining({
          type: "superset",
          itemIds: ["a", "b"],
          restSec: 60,
        }),
      ],
    });
  });

  it("expands the warmup chip and seeds the default checklist", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Розминка" }));
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );
  });
});

describe("SessionView — exercise screen", () => {
  it("renders the focused exercise with set rows, «Список» and neighbour arrows", () => {
    renderView({ focusItemId: "b" });
    expect(
      screen.getByRole("heading", { name: "Присідання" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Вага в кілограмах" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Список" }));
    expect(onOpenItem).toHaveBeenCalledWith(null);
    fireEvent.click(
      screen.getByRole("button", { name: "Наступна вправа: Тяга штанги" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("c");
    fireEvent.click(
      screen.getByRole("button", { name: "Попередня вправа: Жим лежачи" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("a");
  });

  it("removes the exercise from the ⋯ menu and returns to the list", () => {
    renderView({ focusItemId: "b" });
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням: Присідання" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Прибрати з тренування" }),
    );
    expect(removeItem).toHaveBeenCalledWith("w1", "b");
    expect(onOpenItem).toHaveBeenCalledWith(null);
  });

  it("starts a rest from the dock button", () => {
    const { setRestTimer } = renderView({ focusItemId: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Почати відпочинок" }));
    expect(setRestTimer).toHaveBeenCalledWith({
      remaining: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it("shows an undo toast after deleting a set and restores the snapshot", () => {
    renderView({ focusItemId: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Видалити підхід 1" }));
    expect(undoMocks.last?.msg).toBe("Підхід видалено");
    undoMocks.last?.onUndo();
    expect(updateItem).toHaveBeenLastCalledWith("w1", "a", {
      sets: [{ weightKg: 80, reps: 8 }],
    });
  });
});

describe("SessionView — dock during rest", () => {
  it("turns the dock into the rest timer with the next-set hint, ±15 and skip", () => {
    const { setRestTimer } = renderView(
      { focusItemId: "b" },
      { remaining: 83, total: 90 },
    );
    const dock = screen.getByTestId("rest-timer");
    expect(dock).toHaveTextContent("1:23");
    expect(dock).toHaveTextContent("далі підхід 1");
    fireEvent.click(screen.getByRole("button", { name: "Додати 15 секунд" }));
    expect(setRestTimer).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Пропустити" }));
    expect(setRestTimer).toHaveBeenCalledWith(null);
  });
});
