import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";
import { deviceDayKey } from "@sergeant/shared";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * ADR-0078: тренування — особиста сутність, тож день і година
 * `start_workout` / `copy_workout` беруться з годинника ПРИСТРОЮ, як у формі
 * модуля і в `plan_workout`. До 2026-11-18 ці два виконавці жили на
 * київському годиннику: на пристрої поза Києвом час старту з чату розходився
 * з формою на різницю поясів, а після київської півночі — ще й на день.
 *
 * Vitest пінить `TZ=UTC` (`vitest.config.js`), тобто пристрій тут «не в Києві».
 */

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(() => null),
  safeRemoveLS: vi.fn(),
}));
vi.mock("../../hubChatUtils", () => ({ lsSet: vi.fn() }));
vi.mock("./shared", () => ({
  deleteFizrukWorkout: vi.fn(),
  readFizrukWorkouts: vi.fn(() => []),
  persistFizrukWorkouts: vi.fn(),
  persistFizrukCustomExercises: vi.fn(),
}));

import { persistFizrukWorkouts, readFizrukWorkouts } from "./shared";
import { copyWorkout, startWorkout } from "./workouts";

const mockPersist = vi.mocked(persistFizrukWorkouts);
const mockRead = vi.mocked(readFizrukWorkouts);

const persisted = (): Workout => mockPersist.mock.calls[0]![0][0]!;

const DONE: Workout = {
  id: "w_src",
  startedAt: "2026-08-01T10:00:00.000Z",
  endedAt: "2026-08-01T11:00:00.000Z",
  items: [],
  groups: [],
  warmup: null,
  cooldown: null,
  note: "",
  planned: false,
};

/** 22:30 на пристрої 7 серпня; у Києві (EEST, +3) це вже 01:30 8 серпня. */
const LATE = new Date(2026, 7, 7, 22, 30);
const deviceOutsideKyiv = getKyivDayKey(LATE) !== deviceDayKey(LATE);

beforeEach(() => {
  vi.clearAllMocks();
  mockRead.mockReturnValue([]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 3, 22, 12, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("start_workout · годинник пристрою", () => {
  // Регресія 2026-08-07: о 02:48 асистент рапортував «розпочато о 09:00».
  it("без time бере поточну годину пристрою, а не вигадану", () => {
    const out = startWorkout({ name: "start_workout", input: {} });
    expect(out).toContain("розпочато о 12:00");
    expect(persisted().startedAt).toBe(
      new Date(2026, 3, 22, 12, 0).toISOString(),
    );
  });

  it("явні дата й час осідають як стінний годинник пристрою", () => {
    startWorkout({
      name: "start_workout",
      input: { date: "2026-08-07", time: "09:00" },
    });
    expect(persisted().startedAt).toBe(
      new Date(2026, 7, 7, 9, 0).toISOString(),
    );
  });

  it("неможлива дата — відмова, без запису", () => {
    const out = startWorkout({
      name: "start_workout",
      input: { date: "2026-02-30", time: "09:00" },
    });
    expect(out).toBe("Некоректна дата або час.");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it.skipIf(!deviceOutsideKyiv)(
    "пристрій не в Києві, після київської півночі: сьогодні й година пристрою",
    () => {
      vi.setSystemTime(LATE);
      const out = startWorkout({ name: "start_workout", input: {} });
      expect(out).toContain("розпочато о 22:30");
      expect(persisted().startedAt).toBe(LATE.toISOString());
    },
  );
});

describe("copy_workout · годинник пристрою", () => {
  it("без дати копія лягає на сьогодні й поточну годину пристрою", () => {
    mockRead.mockReturnValue([DONE]);
    const out = copyWorkout({ name: "copy_workout", input: {} });
    const result = typeof out === "string" ? out : out.result;
    expect(result).toContain("на 2026-04-22");
    expect(persisted().startedAt).toBe(
      new Date(2026, 3, 22, 12, 0).toISOString(),
    );
  });

  it.skipIf(!deviceOutsideKyiv)(
    "пристрій не в Києві, після київської півночі: день пристрою, не завтрашній київський",
    () => {
      vi.setSystemTime(LATE);
      mockRead.mockReturnValue([DONE]);
      const out = copyWorkout({ name: "copy_workout", input: {} });
      const result = typeof out === "string" ? out : out.result;
      expect(result).toContain("на 2026-08-07");
      expect(persisted().startedAt).toBe(LATE.toISOString());
    },
  );
});
