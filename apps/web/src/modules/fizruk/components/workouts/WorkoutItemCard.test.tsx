// @vitest-environment jsdom
/**
 * Tests for WorkoutItemCard — the editable body of one exercise inside the
 * session exercise screen (`SessionExerciseFocus` owns the header). Covers
 * the three item types (strength / time / distance), the per-row "було"
 * ghost as a field placeholder, the always-visible ✓ control and its
 * three states, the set-add / set-delete flows, the type switcher that
 * hides once a set is logged, the superset rest rule, the recovery chip
 * and the read-only mode. Every mutation flows through a prop, so we
 * assert on the spy callbacks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type {
  Workout,
  WorkoutItem,
  WorkoutGroup,
} from "@sergeant/fizruk-domain";
import { WorkoutItemCard, restSecAfterCheck } from "./WorkoutItemCard";

const updateItem = vi.fn();
const setRestTimer = vi.fn();
const onDeleteSet = vi.fn();
const getDefaultForGroup = vi.fn(() => 90);

function makeItem(over: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: "it-1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets: [{ weightKg: 50, reps: 8 }],
    ...over,
  } as WorkoutItem;
}

function makeWorkout(over: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-06-22T10:00:00Z",
    endedAt: null,
    note: "",
    items: [],
    groups: [],
    ...over,
  } as Workout;
}

function renderCard(
  props: Partial<React.ComponentProps<typeof WorkoutItemCard>> = {},
) {
  const item = props.it ?? makeItem();
  const activeWorkout = props.activeWorkout ?? makeWorkout();
  return render(
    <WorkoutItemCard
      it={item}
      activeWorkout={activeWorkout}
      group={props.group ?? null}
      isReadOnly={props.isReadOnly ?? false}
      lastByExerciseId={props.lastByExerciseId ?? {}}
      recBy={props.recBy ?? {}}
      updateItem={updateItem}
      setRestTimer={setRestTimer}
      getDefaultForGroup={getDefaultForGroup}
      getDefaultForExercise={props.getDefaultForExercise}
      setDefaultForExercise={props.setDefaultForExercise}
      onDeleteSet={onDeleteSet}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemCard — strength set rows", () => {
  it("renders a 4-column row: ordinal, weight, reps, ✓ — no per-row trash except the last", () => {
    renderCard({
      it: makeItem({
        sets: [
          { weightKg: 50, reps: 8 },
          { weightKg: 50, reps: 0 },
        ],
      }),
    });
    expect(
      screen.getAllByRole("textbox", { name: "Вага в кілограмах" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("spinbutton", { name: "Кількість повторень" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Підхід 1: зроблено/ }),
    ).toBeInTheDocument();
    // Кошик лише на останньому рядку.
    expect(
      screen.queryByRole("button", { name: "Видалити підхід 1" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Видалити підхід 2" }),
    ).toBeInTheDocument();
  });

  it("marks the first undone row as the current one", () => {
    const { container } = renderCard({
      it: makeItem({
        sets: [
          { weightKg: 50, reps: 8 },
          { weightKg: 0, reps: 0 },
          { weightKg: 0, reps: 0 },
        ],
      }),
    });
    const current = container.querySelectorAll('[data-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("2");
  });

  it("editing the weight input calls updateItem with the new sets array", () => {
    renderCard();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Вага в кілограмах" }),
      {
        target: { value: "60" },
      },
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 8 }],
    });
  });

  it("tapping ✓ on a completed row starts the rest timer with the default seconds", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("✓ stays enabled on an empty row without a ghost and focuses the reps field instead of starting the timer", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }) });
    const check = screen.getByRole("button", {
      name: /Підхід 1: ще не заповнено/,
    });
    expect(check).toBeEnabled();
    fireEvent.click(check);
    expect(setRestTimer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("spinbutton", { name: "Кількість повторень" }),
    ).toHaveFocus();
  });

  it("shows the previous-session ghost as field placeholders and ✓ = «повторити» applies it and starts the timer", () => {
    renderCard({
      it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }),
      lastByExerciseId: {
        bench: {
          id: "prev",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          type: "strength",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          sets: [{ weightKg: 80, reps: 8 }],
        },
      },
    });
    expect(
      screen.getByRole("textbox", { name: "Вага в кілограмах" }),
    ).toHaveAttribute("placeholder", "80");
    expect(
      screen.getByRole("spinbutton", { name: "Кількість повторень" }),
    ).toHaveAttribute("placeholder", "8");
    fireEvent.click(
      screen.getByRole("button", { name: /Підхід 1: повторити 80×8/ }),
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 80, reps: 8 }],
    });
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("treats a bodyweight set (0 кг × N) as done", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 12 }] }) });
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("editing reps does not auto-start the rest timer", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 50, reps: 0 }] }) });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Кількість повторень" }),
      { target: { value: "8" } },
    );
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("'+ Підхід' copies the last completed set forward", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [
        { weightKg: 50, reps: 8 },
        { weightKg: 50, reps: 8 },
      ],
    });
  });

  it("'+ Підхід' seeds an empty row when there is no completed set and no ghost", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }) });
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [
        { weightKg: 0, reps: 0 },
        { weightKg: 0, reps: 0 },
      ],
    });
  });

  it("deleting the last set snapshots and calls onDeleteSet", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Видалити підхід 1" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { sets: [] });
    expect(onDeleteSet).toHaveBeenCalledWith("w1", "it-1", [
      { weightKg: 50, reps: 8 },
    ]);
  });

  it("does not start the rest timer when the workout has already ended", () => {
    renderCard({
      activeWorkout: makeWorkout({ endedAt: "2026-06-22T11:00:00Z" }),
      isReadOnly: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).not.toHaveBeenCalled();
  });
});

describe("WorkoutItemCard — superset rest rule", () => {
  const group: WorkoutGroup = {
    id: "g1",
    type: "superset",
    itemIds: ["it-1", "it-2"],
    restSec: 45,
  };

  it("does not start a timer for a non-last superset member", () => {
    renderCard({ group });
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("starts the group rest timer from the last superset member", () => {
    renderCard({ it: makeItem({ id: "it-2" }), group });
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 45, total: 45 });
  });

  it("restSecAfterCheck: default outside a group, group seconds on the last member, null otherwise", () => {
    expect(restSecAfterCheck(makeItem(), null, 90)).toBe(90);
    expect(restSecAfterCheck(makeItem(), group, 90)).toBeNull();
    expect(restSecAfterCheck(makeItem({ id: "it-2" }), group, 90)).toBe(45);
  });
});

describe("WorkoutItemCard — type switcher", () => {
  it("shows the compact switcher while no set is logged and hides it after", () => {
    const { unmount } = renderCard({
      it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }),
    });
    expect(
      screen.getByRole("tablist", { name: /Тип вправи/ }),
    ).toBeInTheDocument();
    unmount();
    renderCard();
    expect(screen.queryByRole("tablist", { name: /Тип вправи/ })).toBeNull();
  });

  it("switches the item to time type, seeding durationSec", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }) });
    fireEvent.click(screen.getByRole("tab", { name: /Час: секунди/ }));
    expect(updateItem).toHaveBeenCalledWith(
      "w1",
      "it-1",
      expect.objectContaining({ type: "time" }),
    );
  });

  it("hides the switcher entirely in read-only mode", () => {
    renderCard({
      it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }),
      isReadOnly: true,
    });
    expect(screen.queryByRole("tablist", { name: /Тип вправи/ })).toBeNull();
  });
});

describe("WorkoutItemCard — time / distance", () => {
  it("renders a single duration input for a time item and writes durationSec", () => {
    renderCard({ it: makeItem({ type: "time", durationSec: 30 }) });
    const input = screen.getByRole("spinbutton", {
      name: "Тривалість у секундах",
    });
    fireEvent.change(input, { target: { value: "45" } });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { durationSec: 45 });
  });

  it("renders distance + duration inputs and cardio metrics for a distance item", () => {
    renderCard({
      it: makeItem({ type: "distance", distanceM: 1000, durationSec: 300 }),
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Дистанція в метрах" }),
      {
        target: { value: "1200" },
      },
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { distanceM: 1200 });
    expect(screen.getByText(/Темп/)).toBeInTheDocument();
  });

  it("renders the last-time hint for a time entry", () => {
    renderCard({
      it: makeItem({ type: "time", durationSec: 0 }),
      lastByExerciseId: {
        bench: {
          id: "prev",
          exerciseId: "bench",
          nameUk: "Планка",
          type: "time",
          primaryGroup: "core",
          musclesPrimary: [],
          musclesSecondary: [],
          durationSec: 60,
        },
      },
    });
    expect(screen.getByText(/Минулого разу/)).toHaveTextContent("60с");
  });
});

describe("WorkoutItemCard — recovery chip and read-only", () => {
  it("shows a labeled recovery chip when a primary muscle is red in recBy", () => {
    renderCard({
      recBy: { pec: { status: "red", label: "Груди", daysSince: 1 } },
    });
    expect(screen.getByText("Ще рано: Груди")).toBeInTheDocument();
  });

  it("renders no recovery chip when there is no conflict", () => {
    renderCard();
    expect(screen.queryByLabelText("Попередження про відновлення")).toBeNull();
  });

  it("read-only mode disables set editing and hides + Підхід and the trash", () => {
    renderCard({ isReadOnly: true });
    expect(
      screen.getByRole("textbox", { name: "Вага в кілограмах" }),
    ).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "+ Підхід" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Видалити підхід 1" }),
    ).toBeNull();
  });
});
