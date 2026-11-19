/**
 * `log_set` / `plan_workout` за типом виміру вправи (спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 7): секунди й
 * метри на підході, тип із каталогу й памʼяті, тип із даних, дзеркало.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeWorkoutSetCount, type Workout } from "@sergeant/fizruk-domain";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(),
  safeRemoveLS: vi.fn(),
}));
vi.mock("../../hubChatUtils", () => ({
  lsSet: vi.fn(),
}));
vi.mock("./shared", () => ({
  deleteFizrukWorkout: vi.fn(),
  readFizrukWorkouts: vi.fn(),
  persistFizrukWorkouts: vi.fn(),
  persistFizrukCustomExercises: vi.fn(),
}));
vi.mock("@fizruk/lib/exerciseMeasurePrefsCache", () => ({
  currentExerciseMeasurePrefs: vi.fn(),
}));

import { safeReadStringLS } from "@shared/lib/storage/storage";
import { currentExerciseMeasurePrefs } from "@fizruk/lib/exerciseMeasurePrefsCache";
import { persistFizrukWorkouts, readFizrukWorkouts } from "./shared";
import { logSet, planWorkout } from "./workouts";
import { renderSummary } from "../../hubChatActionCardsRegistry";

const mockReadWorkouts = readFizrukWorkouts as ReturnType<typeof vi.fn>;
const mockPersist = persistFizrukWorkouts as ReturnType<typeof vi.fn>;
const mockReadLS = safeReadStringLS as ReturnType<typeof vi.fn>;
const mockPrefs = currentExerciseMeasurePrefs as ReturnType<typeof vi.fn>;

function persistedItem(idx = 0) {
  const persisted = mockPersist.mock.calls[0]![0] as Workout[];
  return persisted[0]!.items[idx]!;
}

function activeWorkout(items: Workout["items"]): Workout {
  return {
    id: "w_active",
    startedAt: "2026-11-18T09:00:00.000Z",
    endedAt: null,
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    planned: false,
  };
}

function benchItem(sets: Workout["items"][number]["sets"]) {
  return {
    id: "i_bench",
    exerciseId: "bench_press_barbell",
    nameUk: "Жим штанги лежачи",
    primaryGroup: "chest",
    type: "strength" as const,
    measure: "weight_reps",
    musclesPrimary: [],
    musclesSecondary: [],
    sets,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadWorkouts.mockReturnValue([]);
  mockReadLS.mockReturnValue(null);
  mockPrefs.mockReturnValue({});
});

describe("log_set: секунди й метри", () => {
  it("планка 60 секунд — тип «час» з каталогу, секунди в підході, дзеркало суми", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Планка", duration_sec: 60 },
    });
    const item = persistedItem();
    expect(item.measure).toBe("time");
    expect(item.type).toBe("time");
    expect(item.sets).toEqual([{ weightKg: 0, reps: 0, durationSec: 60 }]);
    expect(item.durationSec).toBe(60);
    expect(result).toContain("1 хв 0 с");
  });

  it("три підходи по 30 с — «3 × 30 с» у відповіді", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Планка", duration_sec: 30, sets: 3 },
    });
    expect(result).toContain("3 × 30 с");
    expect(persistedItem().durationSec).toBe(90);
  });

  it("біг 400 метрів — тип «дистанція × час», метри в підході", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Біг", distance_m: 400 },
    });
    const item = persistedItem();
    expect(item.measure).toBe("distance_time");
    expect(item.type).toBe("distance");
    expect(item.sets?.[0]?.distanceM).toBe(400);
    expect(item.distanceM).toBe(400);
    expect(result).toContain("400 м");
  });

  it("порожній виклик без reps / duration_sec / distance_m відхиляється", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Планка" },
    });
    expect(result).toContain("duration_sec");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("секунди понад межу підходу відхиляються", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Планка", duration_sec: 86_401 },
    });
    expect(result).toContain("Задовгий підхід");
    expect(mockPersist).not.toHaveBeenCalled();
  });
});

describe("log_set: тип вправи", () => {
  it("секунди для вправи на повтори — тип із даних (час), памʼять не пишеться", () => {
    logSet({
      name: "log_set",
      input: { exercise_name: "Жим штанги лежачи", duration_sec: 40 },
    });
    expect(persistedItem().measure).toBe("time");
    expect(mockPrefs).toHaveBeenCalled();
  });

  it("секунди з вагою для вправи на повтори — вага × час", () => {
    logSet({
      name: "log_set",
      input: {
        exercise_name: "Жим штанги лежачи",
        duration_sec: 40,
        weight_kg: 20,
      },
    });
    const item = persistedItem();
    expect(item.measure).toBe("weight_time");
    expect(item.sets?.[0]).toEqual({
      weightKg: 20,
      reps: 0,
      durationSec: 40,
    });
  });

  it("памʼять людини сильніша за дефолт каталогу", () => {
    mockPrefs.mockReturnValue({ pushup: "weight_reps" });
    logSet({
      name: "log_set",
      input: { exercise_name: "Віджимання від підлоги", reps: 15 },
    });
    expect(persistedItem().measure).toBe("weight_reps");
  });

  it("дефолт каталогу без памʼяті — «лише повтори»", () => {
    logSet({
      name: "log_set",
      input: { exercise_name: "Віджимання від підлоги", reps: 15 },
    });
    const item = persistedItem();
    expect(item.measure).toBe("reps");
    expect(item.sets?.[0]).toEqual({ weightKg: 0, reps: 15 });
  });

  it("вправа із зробленими повторами не перемикається на час", () => {
    mockReadWorkouts.mockReturnValue([
      activeWorkout([benchItem([{ weightKg: 80, reps: 8 }])]),
    ]);
    mockReadLS.mockReturnValue("w_active");
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Жим штанги лежачи", duration_sec: 30 },
    });
    expect(result).toContain("передай reps");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("вправа лише з рядками плану перемикається на час, рядки лишаються", () => {
    mockReadWorkouts.mockReturnValue([
      activeWorkout([
        benchItem([
          { weightKg: 0, reps: 0 },
          { weightKg: 0, reps: 0 },
        ]),
      ]),
    ]);
    mockReadLS.mockReturnValue("w_active");
    logSet({
      name: "log_set",
      input: { exercise_name: "Жим штанги лежачи", duration_sec: 30 },
    });
    const item = persistedItem();
    expect(item.measure).toBe("time");
    expect(item.sets).toHaveLength(3);
    expect(item.durationSec).toBe(30);
  });
});

describe("plan_workout: секунди", () => {
  it("секунди ставлять тип «час», рядки плану незараховані", () => {
    const result = planWorkout({
      name: "plan_workout",
      input: {
        exercises: [{ name: "Жим штанги лежачи", sets: 3, seconds: 30 }],
      },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    const item = persisted[0]!.items[0]!;
    expect(item.measure).toBe("time");
    expect(item.type).toBe("time");
    expect(item.sets).toEqual([
      { weightKg: 0, reps: 0 },
      { weightKg: 0, reps: 0 },
      { weightKg: 0, reps: 0 },
    ]);
    expect(computeWorkoutSetCount(persisted[0]!)).toBe(0);
    expect(result).toContain("Секунди в план не записуються");
  });

  it("без секунд вправа бере тип каталогу", () => {
    planWorkout({
      name: "plan_workout",
      input: { exercises: [{ name: "Планка", sets: 2 }] },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]!.items[0]!.measure).toBe("time");
  });
});

describe("картка дії log_set", () => {
  it("підходи на час — «3 × 30 с»", () => {
    expect(
      renderSummary(
        "log_set",
        { exercise_name: "Планка", duration_sec: 30, sets: 3 },
        "ok",
      ),
    ).toContain("3 × 30 с");
  });

  it("дистанція — «400 м»", () => {
    expect(
      renderSummary("log_set", { exercise_name: "Біг", distance_m: 400 }, "ok"),
    ).toContain("400 м");
  });
});
