import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEvent, storage } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  storage: new Map<string, string>(),
}));
vi.mock("../../../core/observability/analytics", () => ({
  ANALYTICS_EVENTS: {
    FIZRUK_WORKOUT_STARTED: "fizruk_workout_started",
    FIZRUK_WORKOUT_DISCARDED: "fizruk_workout_discarded",
    FIZRUK_REST_TIMER_DONE: "fizruk_rest_timer_done",
  },
  trackEvent,
}));
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringSS: (key: string) => storage.get(key) ?? null,
  safeRemoveSS: (key: string) => storage.delete(key),
  safeWriteSS: (key: string, value: string) => {
    storage.set(key, value);
    return true;
  },
}));

import {
  trackFizrukRestTimerDone,
  trackFizrukWorkoutDiscarded,
  trackFizrukWorkoutRouteOpened,
  trackFizrukWorkoutStarted,
} from "./workoutTelemetry";

beforeEach(() => {
  trackEvent.mockClear();
  storage.clear();
});

describe("fizruk workout telemetry", () => {
  it("does not misclassify the first route mount after creation as resume", () => {
    trackFizrukWorkoutStarted("w1", "quick_start");
    trackFizrukWorkoutRouteOpened("w1");

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("fizruk_workout_started", {
      source: "quick_start",
    });
  });

  // 02-A — «Повторити це тренування» on the read-only summary is its own
  // start source, distinct from quick_start/template/resume.
  it("accepts 'repeat' as a start source", () => {
    trackFizrukWorkoutStarted("w2", "repeat");
    expect(trackEvent).toHaveBeenCalledWith("fizruk_workout_started", {
      source: "repeat",
    });
  });

  it("records a later route restoration as resume", () => {
    trackFizrukWorkoutRouteOpened("w1");
    expect(trackEvent).toHaveBeenCalledWith("fizruk_workout_started", {
      source: "resume",
    });
  });

  it("records discard and both rest outcomes", () => {
    trackFizrukWorkoutDiscarded();
    trackFizrukRestTimerDone("completed");
    trackFizrukRestTimerDone("skipped");

    expect(trackEvent.mock.calls).toEqual([
      ["fizruk_workout_discarded"],
      ["fizruk_rest_timer_done", { outcome: "completed" }],
      ["fizruk_rest_timer_done", { outcome: "skipped" }],
    ]);
  });
});
