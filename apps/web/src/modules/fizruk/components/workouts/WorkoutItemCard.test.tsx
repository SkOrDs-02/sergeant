// @vitest-environment jsdom
/**
 * Tests for WorkoutItemCard — the editable per-item tile inside the
 * active-workout panel. Covers the three item types (strength / time /
 * distance), the per-row "було" ghost, the ✓ done control, group
 * member labelling, the recovery chip, the delete-item and delete-set
 * flows, and the read-only mode. Every mutation flows through a prop,
 * so we assert on the spy callbacks.
 *
 * Redesign 2026-08 note: the full-size "Тип" segmented control and the
 * always-expanded rest-timer preset row moved OUT of this card (see
 * `WorkoutItemTypeSwitcher.test.tsx` and the rewritten
 * `WorkoutItemRestPresets.tsx`). A COMPACT type switcher returned to the
 * card 2026-08-08 (owner report: switching час/дистанція for a specific
 * exercise became unreachable) — covered by the "compact type switcher"
 * block below.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  Workout,
  WorkoutItem,
  WorkoutGroup,
} from "@sergeant/fizruk-domain";
import { WorkoutItemCard } from "./WorkoutItemCard";

const removeItem = vi.fn();
const updateItem = vi.fn();
const setRestTimer = vi.fn();
const onToggleGroupSelect = vi.fn();
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
    <MemoryRouter initialEntries={["/fizruk/workouts"]}>
      <WorkoutItemCard
        it={item}
        activeWorkout={activeWorkout}
        group={props.group ?? null}
        groupMemberPosition={props.groupMemberPosition}
        groupSelectMode={props.groupSelectMode ?? false}
        isSelected={props.isSelected ?? false}
        isReadOnly={props.isReadOnly ?? false}
        lastByExerciseId={props.lastByExerciseId ?? {}}
        musclesUk={props.musclesUk ?? { pec: "Грудні" }}
        recBy={props.recBy ?? {}}
        onToggleGroupSelect={onToggleGroupSelect}
        removeItem={removeItem}
        updateItem={updateItem}
        setRestTimer={setRestTimer}
        getDefaultForGroup={getDefaultForGroup}
        getDefaultForExercise={props.getDefaultForExercise}
        setDefaultForExercise={props.setDefaultForExercise}
        onDeleteSet={onDeleteSet}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemCard — strength", () => {
  it("renders the exercise name and primary muscles", () => {
    renderCard();
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("Грудні")).toBeInTheDocument();
  });

  it("renders a set row with an ordinal, weight + reps inputs, and a done control", () => {
    renderCard();
    expect(screen.getByLabelText("Вага в кілограмах")).toBeInTheDocument();
    expect(screen.getByLabelText("Кількість повторень")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Підхід 1: зроблено, почати відпочинок",
      }),
    ).toBeInTheDocument();
  });

  it("editing the weight input calls updateItem with the new sets array", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Вага в кілограмах"), {
      target: { value: "60" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 8 }],
    });
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

  it("'+ Підхід' falls back to the previous-session ghost when nothing is completed yet", () => {
    renderCard({
      it: makeItem({ sets: [] }),
      lastByExerciseId: {
        bench: { type: "strength", sets: [{ weightKg: 80, reps: 8 }] },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 80, reps: 8 }],
    });
  });

  it("'+ Підхід' seeds an empty row when there is no completed set and no ghost", () => {
    renderCard({ it: makeItem({ sets: [] }) });
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 0, reps: 0 }],
    });
  });

  it("deleting a set snapshots and calls onDeleteSet", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Видалити підхід 1" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { sets: [] });
    expect(onDeleteSet).toHaveBeenCalledWith("w1", "it-1", [
      { weightKg: 50, reps: 8 },
    ]);
  });

  it("tapping the done ✓ control on a completed row starts the rest timer", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підхід 1: зроблено, почати відпочинок",
      }),
    );
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("the done ✓ control is disabled while the row is incomplete and does not start the timer", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }) });
    const doneButton = screen.getByRole("button", {
      name: "Підхід 1: ще не заповнено",
    });
    expect(doneButton).toBeDisabled();
    fireEvent.click(doneButton);
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("treats a bodyweight set (0 кг × N) as done — ✓ works for підтягування/віджимання", () => {
    // Регрес, спійманий на ревʼю редизайну: критерій «зроблено» вимагав
    // ваги > 0, тож для вправ із власною вагою ✓ була мертвою і таймер
    // не стартував узагалі. Каталог має окремий фільтр обладнання
    // «Власна вага», тобто цей клас вправ — не крайній випадок.
    renderCard({ it: makeItem({ sets: [{ weightKg: 0, reps: 12 }] }) });
    const doneButton = screen.getByRole("button", {
      name: "Підхід 1: зроблено, почати відпочинок",
    });
    expect(doneButton).not.toBeDisabled();
    fireEvent.click(doneButton);
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("editing reps no longer auto-starts the rest timer (explicit ✓ tap required)", () => {
    renderCard({ it: makeItem({ sets: [{ weightKg: 50, reps: 0 }] }) });
    fireEvent.change(screen.getByLabelText("Кількість повторень"), {
      target: { value: "8" },
    });
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("tapping a per-row ghost fills weight + reps from the previous session", () => {
    renderCard({
      it: makeItem({ sets: [{ weightKg: 0, reps: 0 }] }),
      lastByExerciseId: {
        bench: { type: "strength", sets: [{ weightKg: 80, reps: 8 }] },
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підставити 80×8 з минулого разу",
      }),
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 80, reps: 8 }],
    });
  });

  it("hides the per-row ghost once the row is already done", () => {
    renderCard({
      lastByExerciseId: {
        bench: { type: "strength", sets: [{ weightKg: 80, reps: 8 }] },
      },
    });
    expect(
      screen.queryByRole("button", { name: /Підставити/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the recommended rest-timer preset and opens the presets menu", () => {
    const setDefaultForExercise = vi.fn();
    renderCard({ setDefaultForExercise });
    // Default 90 → "90 с" recommended button, always visible.
    expect(screen.getByText("90 с")).toBeInTheDocument();
    // Other presets live behind the menu trigger now (item 7 redesign).
    expect(
      screen.queryByRole("button", { name: "60 с" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Показати інші варіанти часу відпочинку",
      }),
    );
    const option = screen.getByRole("menuitem", { name: "60 с" });
    fireEvent.click(option);
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 60, total: 60 });
    expect(setDefaultForExercise).toHaveBeenCalledWith("bench", 60);
  });

  it("removing the whole item calls removeItem", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити вправу з тренування" }),
    );
    expect(removeItem).toHaveBeenCalledWith("w1", "it-1");
  });
});

describe("WorkoutItemCard — compact type switcher", () => {
  it("switches the item to time type, seeding durationSec", () => {
    renderCard();
    fireEvent.click(screen.getByRole("tab", { name: "Час: секунди" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      type: "time",
      durationSec: 0,
    });
  });

  it("switches a time item back to strength, seeding one empty set", () => {
    renderCard({ it: makeItem({ type: "time", durationSec: 60, sets: [] }) });
    fireEvent.click(screen.getByRole("tab", { name: /Силова/ }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      type: "strength",
      sets: [{ weightKg: 0, reps: 0 }],
    });
  });

  it("hides the switcher entirely in read-only mode", () => {
    renderCard({ isReadOnly: true });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("WorkoutItemCard — rest timer guards on the done ✓ control", () => {
  it("does not start the rest timer when the workout has already ended", () => {
    renderCard({
      activeWorkout: makeWorkout({ endedAt: "2026-06-22T11:00:00Z" }),
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підхід 1: зроблено, почати відпочинок",
      }),
    );
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("does not start the rest timer for a grouped item (shared group timer applies instead)", () => {
    const group = { id: "g1", type: "superset" } as WorkoutGroup;
    renderCard({ group, groupMemberPosition: 1 });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підхід 1: зроблено, почати відпочинок",
      }),
    );
    expect(setRestTimer).not.toHaveBeenCalled();
  });
});

describe("WorkoutItemCard — groups", () => {
  it("renders the group-select checkbox with an accessible name + state and toggles it", () => {
    renderCard({ groupSelectMode: true, isSelected: false });
    const checkbox = screen.getByRole("checkbox", {
      name: "Жим лежачи: вибрати для обʼєднання в суперсет",
    });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox);
    expect(onToggleGroupSelect).toHaveBeenCalledWith("it-1");
  });

  it("reflects isSelected via aria-checked on the group-select checkbox", () => {
    renderCard({ groupSelectMode: true, isSelected: true });
    expect(
      screen.getByRole("checkbox", {
        name: "Жим лежачи: вибрати для обʼєднання в суперсет",
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("renders an A1-style group-member label instead of the full superset badge", () => {
    const group = { id: "g1", type: "superset" } as WorkoutGroup;
    renderCard({ group, groupMemberPosition: 1 });
    expect(screen.getByText("A1")).toBeInTheDocument();
    // Grouped strength items hide the per-item rest-timer block.
    expect(screen.queryByText("90 с")).not.toBeInTheDocument();
  });

  it("does not render a group-member label without a position (standalone item)", () => {
    renderCard();
    expect(screen.queryByText(/^A\d+$/)).not.toBeInTheDocument();
  });
});

describe("WorkoutItemCard — time + distance + read-only", () => {
  it("renders a single duration input for a time item", () => {
    renderCard({ it: makeItem({ type: "time", durationSec: 60, sets: [] }) });
    expect(screen.getByLabelText("Тривалість у секундах")).toBeInTheDocument();
    expect(screen.getByText(/планка/i)).toBeInTheDocument();
  });

  it("duration input change in time type calls updateItem with durationSec", () => {
    renderCard({ it: makeItem({ type: "time", durationSec: 60, sets: [] }) });
    fireEvent.change(screen.getByLabelText("Тривалість у секундах"), {
      target: { value: "90" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { durationSec: 90 });
  });

  it("renders distance + duration inputs and cardio metrics for a distance item", () => {
    renderCard({
      it: makeItem({
        type: "distance",
        distanceM: 1000,
        durationSec: 300,
        sets: [],
      }),
    });
    expect(screen.getByLabelText("Дистанція в метрах")).toBeInTheDocument();
    expect(screen.getByText("Темп")).toBeInTheDocument();
    expect(screen.getByText("Швидкість")).toBeInTheDocument();
  });

  it("distance input change calls updateItem with distanceM", () => {
    renderCard({
      it: makeItem({
        type: "distance",
        distanceM: 1000,
        durationSec: 300,
        sets: [],
      }),
    });
    fireEvent.change(screen.getByLabelText("Дистанція в метрах"), {
      target: { value: "2000" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { distanceM: 2000 });
  });

  it("distance duration input change calls updateItem with durationSec", () => {
    renderCard({
      it: makeItem({
        type: "distance",
        distanceM: 1000,
        durationSec: 300,
        sets: [],
      }),
    });
    const durationInputs = screen.getAllByLabelText("Тривалість у секундах");
    fireEvent.change(durationInputs[0]!, { target: { value: "400" } });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { durationSec: 400 });
  });

  it("read-only mode hides the delete-item button and disables set editing/deletion", () => {
    renderCard({ isReadOnly: true });
    expect(
      screen.queryByRole("button", { name: "Видалити вправу з тренування" }),
    ).not.toBeInTheDocument();
    const weightInput = screen.getByLabelText("Вага в кілограмах");
    expect(weightInput).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: "Видалити підхід 1" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Підхід 1: зроблено, почати відпочинок",
      }),
    ).toBeDisabled();
  });

  it("navigates to the exercise detail when the name button is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Жим лежачи" }));
    // Navigation is internal (useFizrukRoute); assert no crash + button works.
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
  });
});

describe("WorkoutItemCard — last-time hint (time/distance only)", () => {
  it("renders distance metrics in the last-time hint for a distance entry", () => {
    renderCard({
      lastByExerciseId: {
        bench: {
          type: "distance",
          distanceM: 5000,
          durationSec: 1800,
        },
      },
    });
    expect(screen.getByText(/5000м/)).toBeInTheDocument();
  });

  it("renders duration seconds in the last-time hint for a time entry", () => {
    renderCard({
      lastByExerciseId: {
        bench: {
          type: "time",
          durationSec: 120,
        },
      },
    });
    expect(screen.getByText(/120с/)).toBeInTheDocument();
  });

  it("renders no caption hint for a strength entry — its ghost lives in the set row instead", () => {
    renderCard({
      lastByExerciseId: {
        bench: {
          type: "strength",
          sets: [{ weightKg: 60, reps: 6 }],
        },
      },
    });
    expect(screen.queryByText(/Минулого разу/)).not.toBeInTheDocument();
  });
});

describe("WorkoutItemCard — recovery conflict chip", () => {
  it("shows a recovery chip and reveals detail on tap when a primary muscle is red in recBy", () => {
    renderCard({
      recBy: {
        pec: {
          id: "pec",
          label: "Груди",
          status: "red" as const,
          lastAt: Date.now() - 86400000,
          daysSince: 1,
          load7d: 0,
          fatigue: 0,
        },
      },
    });
    expect(screen.queryByText(/Ще не відновились/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Попередження про відновлення"));
    expect(screen.getByText(/Ще не відновились/)).toBeInTheDocument();
  });

  it("renders no recovery chip when there is no conflict", () => {
    renderCard();
    expect(
      screen.queryByLabelText("Попередження про відновлення"),
    ).not.toBeInTheDocument();
  });
});

describe("WorkoutItemCard — stable set keys across a mid-list delete", () => {
  it("keeps a surviving set's own input DOM node (not a value that drifted onto the wrong row) after deleting a set above it", () => {
    const initialSets = [
      { weightKg: 10, reps: 1 },
      { weightKg: 20, reps: 2 },
      { weightKg: 30, reps: 3 },
    ];
    const { rerender } = renderCard({ it: makeItem({ sets: initialSets }) });

    const weightInputsBefore = screen.getAllByLabelText("Вага в кілограмах");
    expect(weightInputsBefore).toHaveLength(3);
    const thirdRowInput = weightInputsBefore[2]!; // weightKg: 30

    // Delete the MIDDLE set (idx 1) — the click handler splices the
    // internal stable-key bookkeeping at the same index before calling
    // `updateItem`, so the mapping stays correct once the parent's
    // `it.sets` prop reflects the change.
    const deleteButtons = screen.getAllByRole("button", {
      name: /^Видалити підхід \d+$/,
    });
    expect(deleteButtons).toHaveLength(3);
    fireEvent.click(deleteButtons[1]!);
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [initialSets[0], initialSets[2]],
    });

    // Simulate the parent flowing the mutated array back down as props
    // (in production this happens via the real state store; `updateItem`
    // is mocked here).
    rerender(
      <MemoryRouter initialEntries={["/fizruk/workouts"]}>
        <WorkoutItemCard
          it={makeItem({ sets: [initialSets[0]!, initialSets[2]!] })}
          activeWorkout={makeWorkout()}
          group={null}
          groupSelectMode={false}
          isSelected={false}
          isReadOnly={false}
          lastByExerciseId={{}}
          musclesUk={{ pec: "Грудні" }}
          recBy={{}}
          onToggleGroupSelect={onToggleGroupSelect}
          removeItem={removeItem}
          updateItem={updateItem}
          setRestTimer={setRestTimer}
          getDefaultForGroup={getDefaultForGroup}
          onDeleteSet={onDeleteSet}
        />
      </MemoryRouter>,
    );

    const weightInputsAfter = screen.getAllByLabelText("Вага в кілограмах");
    expect(weightInputsAfter).toHaveLength(2);
    // The row that used to be third (weightKg 30) keeps its OWN DOM
    // node — `key={idx}` would instead hand the second row's node
    // (formerly weightKg 20) the third row's data, silently jumping any
    // in-progress edit/focus onto the wrong set.
    expect(weightInputsAfter[1]).toBe(thirdRowInput);
    // Рядкові значення, а не числові: поле ваги — `type="text"`
    // + `inputMode="decimal"`, бо під `type="number"` браузер віддавав
    // порожній рядок на кому і «82,5» мовчки ставало 0.
    expect(weightInputsAfter[1]).toHaveValue("30");
    expect(weightInputsAfter[0]).toHaveValue("10");
  });
});
