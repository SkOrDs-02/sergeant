// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Фз-2 (б), OD-28: правка підходів у підсумку завершеного тренування
 * (спека `docs/work/specs/fizruk-edit-finished-workout.md`). Обгортка тримає
 * тренування в стані, як `useWorkouts`, тож плитки перераховуються з того
 * самого журналу, а `endedAt` перевіряється після кожної правки.
 */
import { useEffect, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  withMeasureMirror,
  type Workout,
  type WorkoutItem,
  type WorkoutSet,
} from "@sergeant/fizruk-domain/domain";
import { WorkoutSummaryView } from "./WorkoutSummaryView";

const STARTED = "2026-11-18T17:00:00.000Z";
const ENDED = "2026-11-18T18:00:00.000Z";

function bench(sets: WorkoutSet[]): WorkoutItem {
  return {
    id: "i1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    type: "strength",
    sets,
  };
}

function makeWorkout(items: WorkoutItem[]): Workout {
  return {
    id: "w1",
    startedAt: STARTED,
    endedAt: ENDED,
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
}

let latest: Workout | null = null;

function Harness({
  initial,
  onDeleteSet,
}: {
  initial: Workout;
  onDeleteSet?: (itemId: string, snapshot: WorkoutSet[]) => void;
}) {
  const [w, setW] = useState(initial);
  useEffect(() => {
    latest = w;
  }, [w]);
  return (
    <WorkoutSummaryView
      workout={w}
      onRepeat={vi.fn()}
      onClose={vi.fn()}
      onDelete={vi.fn()}
      onUpdateItemSets={(itemId, sets) =>
        setW((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.id === itemId
              ? withMeasureMirror({ ...it, sets } as WorkoutItem)
              : it,
          ),
        }))
      }
      onDeleteSet={onDeleteSet ?? vi.fn()}
    />
  );
}

function tileValue(label: string): string {
  const tile = screen.getByText(label).parentElement;
  return (tile?.textContent ?? "").replace(label, "").trim();
}

describe("WorkoutSummaryView — правка підходів завершеного тренування", () => {
  it("виправлені повторення перераховують плитки, час завершення той самий", () => {
    render(
      <Harness
        initial={makeWorkout([
          bench([
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ]),
        ])}
      />,
    );
    expect(tileValue("Підходів")).toBe("2");
    fireEvent.click(
      screen.getByRole("button", { name: "Виправити підходи: Жим лежачи" }),
    );
    const reps = screen.getAllByLabelText(/повтор/i);
    fireEvent.change(reps[1]!, { target: { value: "0" } });

    // Підхід без повторень не зарахований (`isSetCompleted`): плитка й
    // рядок підсумку беруть це з того самого журналу.
    expect(tileValue("Підходів")).toBe("1");
    expect(latest?.endedAt).toBe(ENDED);
    expect(latest?.startedAt).toBe(STARTED);
  });

  it("«+ Підхід» додає копію останнього зарахованого підходу", () => {
    render(
      <Harness initial={makeWorkout([bench([{ weightKg: 80, reps: 8 }])])} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Виправити підходи/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));

    expect(latest?.items[0]?.sets).toEqual([
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 8 },
    ]);
    expect(tileValue("Підходів")).toBe("2");
    expect(latest?.endedAt).toBe(ENDED);
  });

  it("«Видалити підхід N» прибирає останній і віддає знімок для повернення", () => {
    const onDeleteSet = vi.fn();
    const sets = [
      { weightKg: 60, reps: 10 },
      { weightKg: 70, reps: 8 },
    ];
    render(
      <Harness
        initial={makeWorkout([bench(sets)])}
        onDeleteSet={onDeleteSet}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Виправити підходи/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити підхід 2: Жим лежачи" }),
    );

    expect(latest?.items[0]?.sets).toEqual([{ weightKg: 60, reps: 10 }]);
    expect(onDeleteSet).toHaveBeenCalledWith("i1", sets);
    expect(tileValue("Підходів")).toBe("1");
  });

  it("підхід на час виправляється полем секунд (тип виміру вправи)", () => {
    const plank: WorkoutItem = {
      ...bench([{ weightKg: 0, reps: 0, durationSec: 30 }]),
      id: "i2",
      exerciseId: "plank",
      nameUk: "Планка",
      measure: "time",
      type: "time",
    };
    render(<Harness initial={makeWorkout([plank])} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Виправити підходи: Планка" }),
    );
    const item = screen.getByText("Планка").closest("li") as HTMLElement;
    expect(within(item).queryByLabelText(/Вага/)).toBeNull();
    fireEvent.change(within(item).getByLabelText(/секунд/i), {
      target: { value: "45" },
    });
    expect(latest?.items[0]?.sets?.[0]?.durationSec).toBe(45);
    expect(latest?.endedAt).toBe(ENDED);
  });

  it("без колбека правки кнопки «Виправити» немає (лише перегляд)", () => {
    render(
      <WorkoutSummaryView
        workout={makeWorkout([bench([{ weightKg: 80, reps: 8 }])])}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Виправити/ })).toBeNull();
  });

  it("старий запис часу без підходів не пропонує правки підходів", () => {
    const cardio: WorkoutItem = {
      id: "i3",
      exerciseId: "run",
      nameUk: "Біг",
      primaryGroup: "cardio",
      musclesPrimary: [],
      musclesSecondary: [],
      type: "time",
      durationSec: 1200,
      sets: [],
    };
    render(<Harness initial={makeWorkout([cardio])} />);
    expect(screen.queryByRole("button", { name: /Виправити/ })).toBeNull();
  });
});
