// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ACTIVE_WORKOUT_KEY, type InjuryMark } from "@sergeant/fizruk-domain";
import type { InjurySiteId } from "@sergeant/fizruk-domain/data";
import type { WorkoutItem } from "@sergeant/fizruk-domain/domain";
import { useFizrukProgramStart } from "./useFizrukProgramStart";

type AddedItem = Partial<WorkoutItem>;

type SetupWorkout = {
  startedAt?: string;
  endedAt?: string | null;
  items?: Array<{
    exerciseId?: string;
    type?: string;
    sets?: Array<{ weightKg?: number; reps?: number }>;
  }>;
};

interface SetupOptions {
  recoveryBy?: Record<string, { status: "red" | "yellow" | "green" }>;
  injurySites?: ReadonlySet<InjurySiteId>;
  injuryMarks?: InjuryMark[];
}

function setup(workouts: SetupWorkout[] = [], options: SetupOptions = {}) {
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
    // Справжній id каталогу: зонна половина травма-перевірки читає реєстр
    // `EXERCISE_INJURY_ZONES` за id (жим — плечовий суглоб).
    {
      id: "bench_press_barbell",
      name: { uk: "Жим лежачи" },
      primaryGroup: "chest",
      muscles: { primary: ["pectoralis_major"], secondary: [] },
    },
  ];
  const onConflict = vi.fn<(start: () => void) => void>();
  const onRecoveryConflict = vi.fn<(start: () => void) => void>();
  const { result } = renderHook(() =>
    useFizrukProgramStart({
      workouts: workouts as never,
      createWorkout,
      addItem,
      exercises,
      navigate,
      onConflict,
      recoveryBy: options.recoveryBy ?? {},
      injurySites: options.injurySites ?? new Set<InjurySiteId>(),
      injuryMarks: options.injuryMarks ?? [],
      onRecoveryConflict,
    }),
  );
  return {
    start: result.current,
    added,
    navigate,
    createWorkout,
    addItem,
    onConflict,
    onRecoveryConflict,
  };
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
    expect(navigate).toHaveBeenCalledWith("workout/w-new");
    expect(localStorage.getItem(ACTIVE_WORKOUT_KEY)).toBe("w-new");
    expect(sessionStorage.getItem("fizruk_workouts_mode")).toBeNull();
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
      {
        endedAt: "2026-07-01T10:00:00.000Z",
        items: [{ exerciseId: "bench", sets: [{ weightKg: 50 }] }],
      },
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

  it("сіє порожні рядки за планом: 3 підходи за замовчуванням, жоден не зарахований", () => {
    const { start, added } = setup([
      {
        endedAt: "2026-07-01T10:00:00.000Z",
        items: [{ exerciseId: "bench", sets: [{ weightKg: 50, reps: 8 }] }],
      },
    ]);
    start({ exerciseIds: ["bench"], progressionKg: 2.5 });
    const sets = added.find((i) => i.exerciseId === "bench")?.sets;
    expect(sets).toEqual([
      { weightKg: 52.5, reps: 0 },
      { weightKg: 52.5, reps: 0 },
      { weightKg: 52.5, reps: 0 },
    ]);
  });

  it("власний план сесії (5×5) сіє пʼять рядків", () => {
    const { start, added } = setup();
    start({ exerciseIds: ["bench"], plan: { sets: 5, reps: 5 } });
    const sets = added.find((i) => i.exerciseId === "bench")?.sets;
    expect(sets).toHaveLength(5);
    expect(sets?.every((s) => s.reps === 0)).toBe(true);
  });

  it("defers creation to the conflict resolver when a workout is unfinished", () => {
    const { start, createWorkout, onConflict } = setup([{ endedAt: null }]);

    start({ exerciseIds: ["bench"] });

    expect(createWorkout).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    onConflict.mock.calls[0]?.[0]();
    expect(createWorkout).toHaveBeenCalledTimes(1);
  });
});

/**
 * Старт програми мусить іти тими самими захистами, що й старт шаблону
 * (аудит 2026-11-17, §3.4): жорстке застереження відновлення/травми
 * (ADR-0083) і режим повернення, у якому вага не підвищується (канон §6,
 * журнал 2026-08-31).
 */
describe("useFizrukProgramStart — захисти старту", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("травмована зона вправи зупиняє старт до підтвердження", () => {
    const { start, createWorkout, onRecoveryConflict } = setup([], {
      injurySites: new Set<InjurySiteId>(["shoulder"]),
    });

    start({ exerciseIds: ["bench_press_barbell"] });

    expect(createWorkout).not.toHaveBeenCalled();
    expect(onRecoveryConflict).toHaveBeenCalledTimes(1);
    onRecoveryConflict.mock.calls[0]?.[0]();
    expect(createWorkout).toHaveBeenCalledTimes(1);
  });

  it("червоний статус мʼяза теж просить підтвердження, як у шаблону", () => {
    const { start, createWorkout, onRecoveryConflict } = setup([], {
      recoveryBy: { pectoralis_major: { status: "red" } },
    });
    start({ exerciseIds: ["bench_press_barbell"] });
    expect(createWorkout).not.toHaveBeenCalled();
    expect(onRecoveryConflict).toHaveBeenCalledTimes(1);
  });

  it("жовтий статус не зупиняє: це порада, не жорстке застереження", () => {
    const { start, createWorkout, onRecoveryConflict } = setup([], {
      recoveryBy: { pectoralis_major: { status: "yellow" } },
    });
    start({ exerciseIds: ["bench_press_barbell"] });
    expect(onRecoveryConflict).not.toHaveBeenCalled();
    expect(createWorkout).toHaveBeenCalledTimes(1);
  });

  it("після паузи не додає крок програми і знижує вагу", () => {
    // Остання сесія 100×5 понад 4 місяці тому: режим повернення, а не
    // «100 + 2.5».
    const { start, added } = setup([
      {
        startedAt: "2026-07-01T10:00:00.000Z",
        endedAt: "2026-07-01T11:00:00.000Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ]);
    start({ exerciseIds: ["bench"], progressionKg: 2.5 });
    const w = added.find((i) => i.exerciseId === "bench")?.sets?.[0]?.weightKg;
    expect(w).toBeLessThan(100);
  });

  it("свіжо знята позначка травми теж вимикає прогресію", () => {
    // Сесія три дні тому — паузи немає, але позначку на груди знято вчора:
    // 21 день мʼякого режиму (ADR-0083 § Наслідки, E-5).
    const { start, added } = setup(
      [
        {
          startedAt: "2026-11-14T10:00:00.000Z",
          endedAt: "2026-11-14T11:00:00.000Z",
          items: [
            {
              exerciseId: "bench_press_barbell",
              type: "strength",
              sets: [{ weightKg: 100, reps: 5 }],
            },
          ],
        },
      ],
      {
        injuryMarks: [
          {
            id: "inj_1",
            site: "chest",
            startedAt: "2026-11-01T10:00:00.000Z",
            clearedAt: "2026-11-16T10:00:00.000Z",
          },
        ],
      },
    );
    start({ exerciseIds: ["bench_press_barbell"], progressionKg: 2.5 });
    const w = added.find((i) => i.exerciseId === "bench_press_barbell")
      ?.sets?.[0]?.weightKg;
    expect(w).toBeLessThan(100);
  });

  it("без режиму повернення прогресія програми діє як раніше", () => {
    const { start, added } = setup([
      {
        startedAt: "2026-11-14T10:00:00.000Z",
        endedAt: "2026-11-14T11:00:00.000Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ]);
    start({ exerciseIds: ["bench"], progressionKg: 2.5 });
    expect(
      added.find((i) => i.exerciseId === "bench")?.sets?.[0]?.weightKg,
    ).toBe(102.5);
  });
});
