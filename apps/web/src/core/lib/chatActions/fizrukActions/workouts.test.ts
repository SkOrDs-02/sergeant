import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(),
  safeRemoveLS: vi.fn(),
}));
vi.mock("../../hubChatUtils", () => ({
  lsSet: vi.fn(),
}));
vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: vi.fn(),
  getKyivDateParts: vi.fn(),
}));
vi.mock("./shared", () => ({
  readFizrukWorkouts: vi.fn(),
  persistFizrukWorkouts: vi.fn(),
}));

import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { lsSet } from "../../hubChatUtils";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { persistFizrukWorkouts, readFizrukWorkouts } from "./shared";
import { finishWorkout, logSet, planWorkout, startWorkout } from "./workouts";

const mockReadWorkouts = readFizrukWorkouts as ReturnType<typeof vi.fn>;
const mockPersist = persistFizrukWorkouts as ReturnType<typeof vi.fn>;
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
