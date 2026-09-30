// @vitest-environment jsdom
/**
 * Unit tests for usePrLatest.
 *
 * The hook is a pure useMemo derivation — no network, no storage, no
 * React context. Tests pin a known "today" via fake timers so that the
 * PR_WINDOW_DAYS lookback is deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";
import { usePrLatest } from "./usePrLatest";

// 2026-06-04 12:00:00 UTC — «сьогодні» 2026-06-04 і для Києва, і для UTC.
const FIXED_NOW = new Date("2026-06-04T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
const originalTz = process.env["TZ"];
afterEach(() => {
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = originalTz;
});

function mkStrengthItem(
  exerciseId: string,
  nameUk: string,
  weightKg: number,
): WorkoutItem {
  return {
    id: `item-${exerciseId}`,
    exerciseId,
    nameUk,
    primaryGroup: "chest",
    musclesPrimary: ["chest"],
    musclesSecondary: [],
    type: "strength",
    sets: [{ weightKg, reps: 5 }],
  };
}

function mkWorkout(
  id: string,
  endedAtIso: string,
  items: WorkoutItem[],
): Workout {
  return {
    id,
    startedAt: endedAtIso,
    endedAt: endedAtIso,
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
}

describe("usePrLatest", () => {
  it("returns null when loaded is false", () => {
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [], loaded: false }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null for an empty workout list", () => {
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [], loaded: true }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when the only workout has no endedAt", () => {
    const incomplete: Workout = {
      id: "w1",
      startedAt: "2026-06-04T09:00:00Z",
      endedAt: null,
      items: [mkStrengthItem("bench", "Жим лежачи", 100)],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [incomplete], loaded: true }),
    );
    expect(result.current).toBeNull();
  });

  it("returns the PR from a completed workout within the 30-day window", () => {
    // Workout ended 1 day ago (device 2026-06-03).
    const w = mkWorkout("w1", "2026-06-03T10:00:00Z", [
      mkStrengthItem("bench", "Жим лежачи", 100),
    ]);
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [w], loaded: true }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.exerciseName).toBe("Жим лежачи");
    expect(result.current!.weightKg).toBe(100);
    expect(result.current!.daysAgo).toBe(1);
  });

  it("рахує «днів тому» за добою пристрою (ADR-0078)", () => {
    process.env["TZ"] = "America/Mexico_City"; // UTC-6
    // FIXED_NOW = 06:00 local Jun 4. Тренування 2026-06-04T05:30Z = Jun 3
    // 23:30 local → вчора за пристроєм (за Києвом було б «сьогодні»).
    const w = mkWorkout("w1", "2026-06-04T05:30:00Z", [
      mkStrengthItem("bench", "Жим лежачи", 100),
    ]);
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [w], loaded: true }),
    );
    expect(result.current!.daysAgo).toBe(1);
  });

  it("returns null when the only PR is older than 30 days", () => {
    // Workout ended 31 days ago — outside the window.
    const oldDate = new Date(FIXED_NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    const w = mkWorkout("w1", oldDate.toISOString(), [
      mkStrengthItem("squat", "Присідання", 80),
    ]);
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [w], loaded: true }),
    );
    expect(result.current).toBeNull();
  });

  it("picks the most-recent PR when multiple exercises have records", () => {
    // bench PR set 2 days ago; squat PR set 1 day ago → squat should win.
    const wBench = mkWorkout("w1", "2026-06-02T10:00:00Z", [
      mkStrengthItem("bench", "Жим лежачи", 120),
    ]);
    const wSquat = mkWorkout("w2", "2026-06-03T10:00:00Z", [
      mkStrengthItem("squat", "Присідання", 90),
    ]);
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [wBench, wSquat], loaded: true }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.exerciseName).toBe("Присідання");
    expect(result.current!.daysAgo).toBe(1);
  });

  it("tracks the first-ever time a weight was achieved as the PR date", () => {
    // Two sessions with the same exercise: older one has higher weight.
    // The hook should report the older session's weight as the PR.
    const wOld = mkWorkout("w1", "2026-05-20T10:00:00Z", [
      mkStrengthItem("bench", "Жим лежачи", 130),
    ]);
    const wNew = mkWorkout("w2", "2026-06-03T10:00:00Z", [
      mkStrengthItem("bench", "Жим лежачи", 110),
    ]);
    const { result } = renderHook(() =>
      usePrLatest({ workouts: [wNew, wOld], loaded: true }),
    );
    // PR is 130 kg (from the older session — highest ever weight).
    expect(result.current).not.toBeNull();
    expect(result.current!.weightKg).toBe(130);
  });
});
