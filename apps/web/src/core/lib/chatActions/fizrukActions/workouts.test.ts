import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(),
  safeRemoveLS: vi.fn(),
}));
vi.mock("../../hubChatUtils", () => ({
  lsSet: vi.fn(),
}));
// `parseKyivDate` лишається справжнім: воно чисте, DST-safe і саме воно
// перетворює київський стінний годинник на інстант. Підмінити його стабом —
// значить перевіряти стаб, а не той перерахунок, заради якого тест існує.
vi.mock("@shared/lib/time/kyivTime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/time/kyivTime")>()),
  getKyivDayKey: vi.fn(),
  getKyivDateParts: vi.fn(),
}));
vi.mock("./shared", () => ({
  readFizrukWorkouts: vi.fn(),
  persistFizrukWorkouts: vi.fn(),
  persistFizrukCustomExercises: vi.fn(),
}));

import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { lsSet } from "../../hubChatUtils";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  persistFizrukCustomExercises,
  persistFizrukWorkouts,
  readFizrukWorkouts,
} from "./shared";
import {
  copyWorkout,
  finishWorkout,
  logSet,
  planWorkout,
  startWorkout,
} from "./workouts";

const mockReadWorkouts = readFizrukWorkouts as ReturnType<typeof vi.fn>;
const mockPersist = persistFizrukWorkouts as ReturnType<typeof vi.fn>;
const mockPersistCustom = persistFizrukCustomExercises as ReturnType<
  typeof vi.fn
>;
const mockReadLS = safeReadStringLS as ReturnType<typeof vi.fn>;
const mockLsSet = lsSet as ReturnType<typeof vi.fn>;
const mockRemoveLS = safeRemoveLS as ReturnType<typeof vi.fn>;
const mockDayKey = getKyivDayKey as ReturnType<typeof vi.fn>;
const mockDateParts = getKyivDateParts as ReturnType<typeof vi.fn>;

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w_test",
    startedAt: "2026-04-20T09:00:00.000Z",
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    planned: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadWorkouts.mockReturnValue([]);
  mockReadLS.mockReturnValue(null);
  mockDayKey.mockReturnValue("2026-04-20");
  mockDateParts.mockReturnValue({ hour: 9, minute: 0 });
});

// ─── logSet ──────────────────────────────────────────────────────────────────

describe("logSet", () => {
  it("returns error for empty exercise name", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "", reps: 10, weight_kg: 0, sets: 1 },
    });
    expect(result).toContain("назва");
  });

  it("returns error for invalid reps", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Squat", reps: -5, weight_kg: 0, sets: 1 },
    });
    expect(result).toContain("повторень");
  });

  it("returns error for zero reps", () => {
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Squat", reps: 0, weight_kg: 0, sets: 1 },
    });
    expect(result).toContain("повторень");
  });

  it("creates new workout and adds exercise when no active workout", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Push-up", reps: 12, weight_kg: 0, sets: 2 },
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("Push-up");
    expect(mockPersist).toHaveBeenCalledOnce();
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items.length).toBe(1);
  });

  it("adds set to existing exercise in active workout", () => {
    const existing = makeWorkout({
      id: "w_active",
      items: [
        {
          id: "i1",
          exerciseId: "",
          nameUk: "Squat",
          primaryGroup: "",
          type: "strength",
          musclesPrimary: [],
          musclesSecondary: [],
          sets: [{ weightKg: 100, reps: 5 }],
          durationSec: 0,
          distanceM: 0,
        },
      ],
    });
    mockReadWorkouts.mockReturnValue([existing]);
    mockReadLS.mockReturnValue("w_active");
    const result = logSet({
      name: "log_set",
      input: { exercise_name: "Squat", reps: 5, weight_kg: 100, sets: 1 },
    });
    expect(result).not.toContain("Нове тренування");
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items[0]?.sets?.length).toBe(2);
  });

  it("sets new active key when creating new workout", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    logSet({
      name: "log_set",
      input: { exercise_name: "Run", reps: 1, weight_kg: 0, sets: 1 },
    });
    expect(mockLsSet).toHaveBeenCalledWith(
      expect.stringContaining("active"),
      expect.any(String),
    );
  });

  it("caps sets at 20", () => {
    mockReadWorkouts.mockReturnValue([]);
    logSet({
      name: "log_set",
      input: { exercise_name: "Bench", reps: 10, weight_kg: 80, sets: 100 },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items[0]?.sets?.length).toBeLessThanOrEqual(20);
  });

  it("uses 0kg when weight is absent/negative", () => {
    mockReadWorkouts.mockReturnValue([]);
    logSet({
      name: "log_set",
      input: { exercise_name: "Squat", reps: 10, weight_kg: -50, sets: 1 },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items[0]?.sets?.[0]?.weightKg).toBe(0);
  });

  // Голосовий ввід («сто пʼятдесят на десять» → 15000) інакше назавжди
  // осідає в 1RM / персональному рекорді й впливає на suggestNextSet.
  describe("reps upper bound (MAX_REPS = 1000)", () => {
    it("rejects reps just above MAX_REPS", () => {
      const result = logSet({
        name: "log_set",
        input: { exercise_name: "Squat", reps: 1001, weight_kg: 50, sets: 1 },
      });
      expect(result).toContain("Забагато повторень");
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it("accepts reps exactly at MAX_REPS boundary", () => {
      mockReadWorkouts.mockReturnValue([]);
      const result = logSet({
        name: "log_set",
        input: { exercise_name: "Squat", reps: 1000, weight_kg: 50, sets: 1 },
      });
      expect(result).not.toContain("Забагато");
      expect(mockPersist).toHaveBeenCalledOnce();
      const persisted = mockPersist.mock.calls[0]![0] as Workout[];
      expect(persisted[0]?.items[0]?.sets?.[0]?.reps).toBe(1000);
    });

    it("still rejects NaN reps via the existing finite check", () => {
      const result = logSet({
        name: "log_set",
        input: { exercise_name: "Squat", reps: NaN, weight_kg: 50, sets: 1 },
      });
      expect(result).toContain("повторень");
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it("still rejects negative reps via the existing finite check", () => {
      const result = logSet({
        name: "log_set",
        input: { exercise_name: "Squat", reps: -1, weight_kg: 50, sets: 1 },
      });
      expect(result).toContain("повторень");
      expect(mockPersist).not.toHaveBeenCalled();
    });
  });

  describe("weight_kg upper bound (MAX_WEIGHT_KG = 1000)", () => {
    it("rejects weight_kg just above MAX_WEIGHT_KG", () => {
      const result = logSet({
        name: "log_set",
        input: {
          exercise_name: "Squat",
          reps: 5,
          weight_kg: 1001,
          sets: 1,
        },
      });
      expect(result).toContain("Вага підходу занадто велика");
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it("accepts weight_kg exactly at MAX_WEIGHT_KG boundary", () => {
      mockReadWorkouts.mockReturnValue([]);
      const result = logSet({
        name: "log_set",
        input: {
          exercise_name: "Squat",
          reps: 5,
          weight_kg: 1000,
          sets: 1,
        },
      });
      expect(result).not.toContain("занадто велика");
      expect(mockPersist).toHaveBeenCalledOnce();
      const persisted = mockPersist.mock.calls[0]![0] as Workout[];
      expect(persisted[0]?.items[0]?.sets?.[0]?.weightKg).toBe(1000);
    });

    it("stays under bound with a normal weight_kg value", () => {
      mockReadWorkouts.mockReturnValue([]);
      const result = logSet({
        name: "log_set",
        input: {
          exercise_name: "Squat",
          reps: 5,
          weight_kg: 100,
          sets: 1,
        },
      });
      expect(result).not.toContain("занадто велика");
      expect(mockPersist).toHaveBeenCalledOnce();
    });
  });
});

// ─── startWorkout ─────────────────────────────────────────────────────────────

describe("startWorkout", () => {
  it("creates a new workout and stores active id", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    const result = startWorkout({ name: "start_workout", input: {} });
    expect(typeof result).toBe("string");
    expect(mockPersist).toHaveBeenCalledOnce();
    expect(mockLsSet).toHaveBeenCalled();
  });

  it("returns error when there is already an active unfinished workout", () => {
    const active = makeWorkout({ id: "w_existing", endedAt: null });
    mockReadWorkouts.mockReturnValue([active]);
    mockReadLS.mockReturnValue("w_existing");
    const result = startWorkout({ name: "start_workout", input: {} });
    expect(result).toContain("активне тренування");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("uses explicit date and time from input", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    startWorkout({
      name: "start_workout",
      input: { date: "2026-06-01", time: "18:30" },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.startedAt).toContain("2026-06-01");
  });

  it("includes note in new workout when provided", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    startWorkout({ name: "start_workout", input: { note: "Chest day" } });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.note).toBe("Chest day");
  });
});

// ─── finishWorkout ────────────────────────────────────────────────────────────

describe("finishWorkout", () => {
  it("returns error when no active workout exists", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockReadLS.mockReturnValue(null);
    const result = finishWorkout({ name: "finish_workout", input: {} });
    expect(result).toContain("Немає активного");
  });

  it("returns error when specified workout id not found", () => {
    mockReadWorkouts.mockReturnValue([]);
    const result = finishWorkout({
      name: "finish_workout",
      input: { workout_id: "nope" },
    });
    expect(result).toContain("не знайдено");
  });

  it("finishes the active workout by id", () => {
    const w = makeWorkout({ id: "w1", endedAt: null });
    mockReadWorkouts.mockReturnValue([w]);
    mockReadLS.mockReturnValue("w1");
    const result = finishWorkout({ name: "finish_workout", input: {} });
    expect(result).toContain("завершено");
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.endedAt).not.toBeNull();
  });

  it("reports already-finished workout without persisting again", () => {
    const w = makeWorkout({ id: "w1", endedAt: "2026-04-20T10:00:00.000Z" });
    mockReadWorkouts.mockReturnValue([w]);
    mockReadLS.mockReturnValue("w1");
    const result = finishWorkout({ name: "finish_workout", input: {} });
    expect(result).toContain("вже завершено");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("clears active key after finishing", () => {
    const w = makeWorkout({ id: "w1", endedAt: null });
    mockReadWorkouts.mockReturnValue([w]);
    mockReadLS.mockReturnValue("w1");
    finishWorkout({ name: "finish_workout", input: {} });
    expect(mockRemoveLS).toHaveBeenCalled();
  });

  it("includes sets count in success message", () => {
    const w = makeWorkout({
      id: "w1",
      endedAt: null,
      items: [
        {
          id: "i1",
          exerciseId: "",
          nameUk: "Squat",
          primaryGroup: "",
          type: "strength",
          musclesPrimary: [],
          musclesSecondary: [],
          sets: [
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ],
          durationSec: 0,
          distanceM: 0,
        },
      ],
    });
    mockReadWorkouts.mockReturnValue([w]);
    mockReadLS.mockReturnValue("w1");
    const result = finishWorkout({ name: "finish_workout", input: {} });
    expect(result).toContain("2");
  });
});

// ─── planWorkout ──────────────────────────────────────────────────────────────

describe("planWorkout", () => {
  it("creates planned workout with items from exercises array", () => {
    mockReadWorkouts.mockReturnValue([]);
    const result = planWorkout({
      name: "plan_workout",
      input: {
        date: "2026-05-01",
        time: "07:00",
        exercises: [{ name: "Push-up", sets: 3, reps: 12 }],
      },
    });
    expect(typeof result).toBe("string");
    expect(mockPersist).toHaveBeenCalledOnce();
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.["planned"]).toBe(true);
    expect(persisted[0]?.items.length).toBe(1);
  });

  it("filters exercises without a name", () => {
    mockReadWorkouts.mockReturnValue([]);
    planWorkout({
      name: "plan_workout",
      input: {
        exercises: [
          { name: "", sets: 2 },
          { name: "Squat", sets: 2 },
        ],
      },
    });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items.length).toBe(1);
    expect(persisted[0]?.items[0]?.nameUk).toBe("Squat");
  });

  it("creates planned workout with 0 items when exercises not provided", () => {
    mockReadWorkouts.mockReturnValue([]);
    planWorkout({ name: "plan_workout", input: {} });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.items).toHaveLength(0);
  });

  it("falls back to today and 09:00 when date/time absent", () => {
    mockReadWorkouts.mockReturnValue([]);
    mockDayKey.mockReturnValue("2026-04-20");
    planWorkout({ name: "plan_workout", input: { exercises: [] } });
    const persisted = mockPersist.mock.calls[0]![0] as Workout[];
    expect(persisted[0]?.startedAt).toContain("2026-04-20");
  });
});

// ─── data-11: справжній exerciseId, ніколи порожній ──────────────────────────

describe("exerciseId резолвиться з назви (data-11)", () => {
  const persistedItems = () =>
    (mockPersist.mock.calls[0]![0] as Workout[]).flatMap((w) => w.items);

  it("log_set: каталожна вправа отримує каталожний id і канонічну назву", () => {
    logSet({
      name: "log_set",
      input: {
        exercise_name: "станова тяга",
        reps: 5,
        weight_kg: 100,
        sets: 2,
      },
    });
    const [item] = persistedItems();
    expect(item?.exerciseId).toBe("deadlift");
    expect(item?.nameUk).toBe("Станова тяга");
    expect(mockPersistCustom).toHaveBeenCalledWith([]); // нічого створювати
  });

  it("log_set: невідома вправа → custom-вправа з тим самим id, що й item", () => {
    logSet({
      name: "log_set",
      input: { exercise_name: "Мій рух", reps: 10, weight_kg: 0, sets: 1 },
    });
    const [item] = persistedItems();
    expect(item?.exerciseId).toMatch(/^custom_/);
    expect(mockPersistCustom).toHaveBeenCalledTimes(1);
    const created = mockPersistCustom.mock.calls[0]![0] as Array<{
      id: string;
      name: { uk: string };
    }>;
    expect(created).toHaveLength(1);
    expect(created[0]?.id).toBe(item?.exerciseId);
    expect(created[0]?.name.uk).toBe("Мій рух");
  });

  it("log_set: custom-вправа записується РАНІШЕ за тренування", () => {
    logSet({
      name: "log_set",
      input: { exercise_name: "Мій рух", reps: 10, weight_kg: 0, sets: 1 },
    });
    expect(mockPersistCustom.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersist.mock.invocationCallOrder[0]!,
    );
  });

  it("log_set: додає підходи до наявного item-а тієї ж вправи за id", () => {
    mockReadWorkouts.mockReturnValue([
      makeWorkout({
        id: "w_active",
        items: [
          {
            id: "i1",
            exerciseId: "squat_barbell",
            nameUk: "Присідання зі штангою",
            primaryGroup: "quadriceps",
            type: "strength",
            musclesPrimary: [],
            musclesSecondary: [],
            sets: [{ weightKg: 60, reps: 8 }],
          },
        ],
      }),
    ]);
    mockReadLS.mockReturnValue("w_active");
    logSet({
      name: "log_set",
      input: { exercise_name: "присідання", reps: 8, weight_kg: 60, sets: 2 },
    });
    const items = persistedItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.sets).toHaveLength(3);
    expect(mockPersistCustom).toHaveBeenCalledWith([]); // нічого створювати
  });

  it("log_set: лагодить порожній exerciseId у наявному item-і зі старого запису", () => {
    mockReadWorkouts.mockReturnValue([
      makeWorkout({
        id: "w_active",
        items: [
          {
            id: "i_legacy",
            exerciseId: "",
            nameUk: "Станова тяга",
            primaryGroup: "",
            type: "strength",
            musclesPrimary: [],
            musclesSecondary: [],
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      }),
    ]);
    mockReadLS.mockReturnValue("w_active");
    logSet({
      name: "log_set",
      input: {
        exercise_name: "Станова тяга",
        reps: 5,
        weight_kg: 100,
        sets: 1,
      },
    });
    const items = persistedItems();
    expect(items[0]?.exerciseId).toBe("deadlift");
    expect(items[0]?.sets).toHaveLength(2);
  });

  it("plan_workout: усі items мають непорожній id, невідомі отримують різні custom-id", () => {
    planWorkout({
      name: "plan_workout",
      input: {
        exercises: [
          { name: "Присідання", sets: 3, reps: 10 },
          { name: "Дивна А", sets: 2, reps: 8 },
          { name: "Дивна Б", sets: 2, reps: 8 },
        ],
      },
    });
    const items = persistedItems();
    expect(items).toHaveLength(3);
    for (const it of items) expect(it.exerciseId).not.toBe("");
    expect(items[0]?.exerciseId).toBe("squat_barbell");
    expect(new Set(items.map((i) => i.exerciseId)).size).toBe(3);
    const created = mockPersistCustom.mock.calls[0]![0] as unknown[];
    expect(created).toHaveLength(2);
  });

  it("copy_workout: порожній exerciseId зі старого запису не переноситься далі", () => {
    mockReadWorkouts.mockReturnValue([
      makeWorkout({
        id: "w_src",
        endedAt: "2026-04-20T10:00:00.000Z",
        items: [
          {
            id: "i_legacy",
            exerciseId: "",
            nameUk: "Станова тяга",
            primaryGroup: "",
            type: "strength",
            musclesPrimary: [],
            musclesSecondary: [],
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      }),
    ]);
    copyWorkout({
      name: "copy_workout",
      input: { source_workout_id: "w_src" },
    });
    const copied = (mockPersist.mock.calls[0]![0] as Workout[])[0]!;
    expect(copied.items[0]?.exerciseId).toBe("deadlift");
  });
});
