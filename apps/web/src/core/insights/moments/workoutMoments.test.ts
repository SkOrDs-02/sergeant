import { describe, expect, it } from "vitest";

import type { Workout } from "../../lib/insightsEngine";
import { detectWorkoutMoment, withWorkoutFinished } from "./workoutMoments";

/** `n` завершених тренувань, по одному на день з 1 серпня. */
function finished(n: number): Workout[] {
  return Array.from({ length: n }, (_, i) => ({
    startedAt: new Date(Date.UTC(2026, 7, 1 + i, 9)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 7, 1 + i, 10)).toISOString(),
  }));
}

const ACTIVE: Workout = { startedAt: "2026-09-20T09:00:00.000Z" };

function finishOne(history: number) {
  const before = [...finished(history), ACTIVE];
  const after = withWorkoutFinished(
    before,
    ACTIVE.startedAt,
    "2026-09-20T10:00:00.000Z",
  );
  return detectWorkoutMoment({ before, after, log: {}, target: "w1" });
}

describe("моменти завершеного тренування", () => {
  it("завершує саме активне тренування і не чіпає решту", () => {
    const after = withWorkoutFinished(
      [...finished(2), ACTIVE],
      ACTIVE.startedAt,
      "x",
    );
    expect(after.filter((w) => w.endedAt)).toHaveLength(3);
    expect(after[2]).toEqual({ ...ACTIVE, endedAt: "x" });
  });

  it("20-те тренування відкриває висновок про найкращий день", () => {
    expect(finishOne(19)).toMatchObject({
      kind: "threshold",
      target: "w1",
      detail: "Найпродуктивніший день для тренувань",
    });
  });

  it("на 17-му каже, скільки лишилось, а на 15-му мовчить", () => {
    expect(finishOne(16)).toEqual({ kind: "approach", target: "w1", value: 3 });
    expect(finishOne(14)).toBeNull();
  });

  it("за порогом рядове тренування мовчить", () => {
    expect(finishOne(25)).toBeNull();
  });
});
