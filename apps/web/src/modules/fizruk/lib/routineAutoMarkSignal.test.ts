import { afterEach, describe, expect, it } from "vitest";
import { onHubBus } from "@shared/lib/modules/hubBus";

import {
  __resetRoutineAutoMarkSignalForTests,
  signalFinishedWorkoutForRoutine,
} from "./routineAutoMarkSignal";

function listen() {
  const events: { source: string; dayKey: string }[] = [];
  const off = onHubBus("routineAutoMark", (d) => events.push(d));
  return { events, off };
}

/** Повноцінне: 40 хвилин по годиннику. */
const FULL = {
  id: "w-full",
  startedAt: "2026-11-18T09:00:00",
  items: [],
};

afterEach(() => __resetRoutineAutoMarkSignalForTests());

describe("signalFinishedWorkoutForRoutine", () => {
  it("повноцінне тренування дає одну подію з днем кінця за пристроєм", () => {
    const { events, off } = listen();
    expect(signalFinishedWorkoutForRoutine(FULL, "2026-11-18T09:40:00")).toBe(
      true,
    );
    off();
    expect(events).toEqual([
      { source: "fizruk_workout", dayKey: "2026-11-18" },
    ]);
  });

  it("порожнє чи обірване (легке) тренування подій не дає", () => {
    const { events, off } = listen();
    signalFinishedWorkoutForRoutine(
      { id: "w-short", startedAt: "2026-11-18T09:00:00", items: [] },
      "2026-11-18T09:05:00",
    );
    signalFinishedWorkoutForRoutine(
      {
        id: "w-planned",
        startedAt: "2026-11-18T09:00:00",
        items: [{ type: "strength", sets: [{ weightKg: 60, reps: 0 }] }],
      },
      "2026-11-18T09:06:00",
    );
    off();
    expect(events).toEqual([]);
  });

  it("повернення в сесію і повторне завершення того самого тренування — не більше однієї події", () => {
    const { events, off } = listen();
    signalFinishedWorkoutForRoutine(FULL, "2026-11-18T09:40:00");
    signalFinishedWorkoutForRoutine(FULL, "2026-11-18T09:55:00");
    off();
    expect(events).toHaveLength(1);
  });

  it("без кінця подій немає", () => {
    const { events, off } = listen();
    expect(signalFinishedWorkoutForRoutine(FULL, null)).toBe(false);
    off();
    expect(events).toEqual([]);
  });
});
