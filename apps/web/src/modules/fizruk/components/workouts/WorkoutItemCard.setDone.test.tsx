// @vitest-environment jsdom
/**
 * Явний прапорець «виконано» і тип підходу в живій сесії (спека
 * `fizruk-set-done-flag-and-set-type.md`; дефолти П-Фз3-4, П-Фз3-6 від
 * 2026-11-19).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import { WorkoutItemCard } from "./WorkoutItemCard";

const updateItem = vi.fn();
const setRestTimer = vi.fn();

function item(sets: WorkoutItem["sets"]): WorkoutItem {
  return {
    id: "it-1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets,
  } as WorkoutItem;
}

const workout = {
  id: "w1",
  startedAt: "2026-11-19T10:00:00Z",
  endedAt: null,
  note: "",
  items: [],
  groups: [],
} as unknown as Workout;

function renderCard(it: WorkoutItem, isRetro = false) {
  return render(
    <WorkoutItemCard
      it={it}
      activeWorkout={workout}
      group={null}
      isReadOnly={false}
      lastByExerciseId={{}}
      recBy={{}}
      injurySites={new Set<never>()}
      updateItem={updateItem}
      setRestTimer={setRestTimer}
      getDefaultForGroup={() => 90}
      onDeleteSet={vi.fn()}
      isRetro={isRetro}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("✓ і явний прапорець", () => {
  it("рядок зі значеннями, але done: false — не зроблений; ✓ ставить true і стартує відпочинок", () => {
    renderCard(item([{ weightKg: 60, reps: 5, done: false }]));
    const check = screen.getByRole("button", {
      name: "Підхід 1: позначити зробленим 60×5",
    });
    fireEvent.click(check);
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 5, done: true }],
    });
    expect(setRestTimer).toHaveBeenCalled();
  });

  it("✓ на явно зробленому рядку знімає позначку і не стартує відпочинок", () => {
    renderCard(item([{ weightKg: 60, reps: 5, done: true }]));
    const check = screen.getByRole("button", {
      name: "Підхід 1: зроблено, зняти позначку",
    });
    expect(check).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(check);
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 5, done: false }],
    });
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("вписані повтори без прапорця: ✓ підтверджує (true) і стартує відпочинок", () => {
    renderCard(item([{ weightKg: 60, reps: 5 }]));
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 5, done: true }],
    });
    expect(setRestTimer).toHaveBeenCalled();
  });

  it("вписати повтори в рядок done: false у живій сесії не зараховує його без ✓", () => {
    renderCard(item([{ weightKg: 60, reps: 0, done: false }]));
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Кількість повторень" }),
      { target: { value: "8" } },
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 8, done: false }],
    });
  });

  it("ретро без ✓: вписані повтори зараховують рядок плану (done: true)", () => {
    renderCard(item([{ weightKg: 60, reps: 0, done: false }]), true);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Кількість повторень" }),
      { target: { value: "8" } },
    );
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 8, done: true }],
    });
  });
});

describe("тип підходу (тап по номеру)", () => {
  it("номер відкриває панель, «Розминка» пише setType у рядок", () => {
    renderCard(item([{ weightKg: 20, reps: 10 }]));
    const trigger = screen.getByRole("button", {
      name: "Підхід 1, звичайний: змінити тип",
    });
    expect(trigger).toHaveTextContent("1");
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: /Тип підходу/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Розминка" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 20, reps: 10, setType: "warmup" }],
    });
  });

  it("типізований підхід показує літеру, повна назва — для скрінрідера", () => {
    renderCard(
      item([
        { weightKg: 20, reps: 10, setType: "warmup" },
        { weightKg: 60, reps: 5, setType: "drop" },
        { weightKg: 60, reps: 5, setType: "failure" },
      ]),
    );
    const w = screen.getByRole("button", {
      name: "Підхід 1, розминка: змінити тип",
    });
    expect(w).toHaveTextContent("Р");
    expect(w).toHaveAttribute("title", "Розминка");
    expect(
      screen.getByRole("button", { name: "Підхід 2, дроп: змінити тип" }),
    ).toHaveTextContent("Д");
    expect(
      screen.getByRole("button", { name: "Підхід 3, до відмови: змінити тип" }),
    ).toHaveTextContent("В");
  });

  it("«Звичайний» знімає тип", () => {
    renderCard(item([{ weightKg: 20, reps: 10, setType: "warmup" }]));
    fireEvent.click(
      screen.getByRole("button", { name: "Підхід 1, розминка: змінити тип" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Звичайний" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 20, reps: 10, setType: null }],
    });
  });
});
