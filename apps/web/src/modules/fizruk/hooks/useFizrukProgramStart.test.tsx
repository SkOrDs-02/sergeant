// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import type { WorkoutItem } from "@sergeant/fizruk-domain/domain";
import { useFizrukProgramStart } from "./useFizrukProgramStart";

type AddedItem = Partial<WorkoutItem>;

function setup(
  workouts: Array<{
    items?: Array<{
      exerciseId?: string;
      sets?: Array<{ weightKg?: number }>;
    }>;
  }> = [],
) {
  const added: AddedItem[] = [];
  const navigate = vi.fn();
  const createWorkout = vi.fn(() => ({ id: "w-new" }));
  const addItem = vi.fn((_w: string, item: AddedItem) => {
    added.push(item);
    return "item-id";
  });
  const exercises = [
    {
      id: "bench",
      name: { uk: "Жим" },
      primaryGroup: "chest",
      muscles: { primary: ["pec"], secondary: ["tri"] },
    },
    {
      id: "run",
      name: { uk: "Біг" },
      primaryGroup: "cardio",
    },
  ];
  const { result } = renderHook(() =>
    useFizrukProgramStart({
      workouts,
      createWorkout,
      addItem,
      exercises,
      navigate,
    }),
  );
  return { start: result.current, added, navigate, createWorkout, addItem };
}

describe("useFizrukProgramStart", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("no-ops for a null session", () => {
    const { start, createWorkout, navigate } = setup();
    start(null);
    expect(createWorkout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("no-ops when no session exercises resolve", () => {
    const { start, createWorkout } = setup();
    start({ exerciseIds: ["unknown"] });
    expect(createWorkout).not.toHaveBeenCalled();
  });

  it("creates a workout, adds items, persists active id, and navigates", () => {
    const { start, added, navigate } = setup();
    start({ exerciseIds: ["bench", "run"] });
    expect(added).toHaveLength(2);
    expect(navigate).toHaveBeenCalledWith("workouts");
    expect(localStorage.getItem(ACTIVE_WORKOUT_KEY)).toBe("w-new");
    expect(sessionStorage.getItem("fizruk_workouts_mode")).toBe("log");
  });

  it("marks cardio exercises as distance type without sets", () => {
    const { start, added } = setup();
    start({ exerciseIds: ["run"] });
    const cardio = added.find((i) => i.exerciseId === "run");
    expect(cardio?.type).toBe("distance");
    expect(cardio?.sets).toBeUndefined();
  });

  it("applies progression to the last-used weight for strength exercises", () => {
    const { start, added } = setup([
      { items: [{ exerciseId: "bench", sets: [{ weightKg: 50 }] }] },
    ]);
    start({ exerciseIds: ["bench"], progressionKg: 2.5 });
    const bench = added.find((i) => i.exerciseId === "bench");
    expect(bench?.sets?.[0]?.weightKg).toBe(52.5);
  });

  it("defaults strength weight to 0 when no prior history exists", () => {
    const { start, added } = setup();
    start({ exerciseIds: ["bench"], progressionKg: 5 });
    const bench = added.find((i) => i.exerciseId === "bench");
    expect(bench?.sets?.[0]?.weightKg).toBe(0);
  });
});
