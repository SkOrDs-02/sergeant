// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkouts } from "./useWorkouts";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";
import type { Workout } from "@sergeant/fizruk-domain";

type CreatedWorkout = ReturnType<
  ReturnType<typeof useWorkouts>["createWorkout"]
>;

/**
 * Stage 8 PR #057f-tombstone: hooks read from the SQLite warm cache,
 * not LS. Seed the cache directly + notify the read gate so the
 * `loaded` flag flips to `true` on the next tick.
 */
function seedWorkouts(workouts: Workout[]) {
  __setFizrukSqliteCacheForTests({ workouts });
  notifyFizrukSqliteCacheRefresh();
}

describe("useWorkouts – finish flow edge cases", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFizrukSqliteCache();
  });

  it("eventually reports loaded=true after mount", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("endWorkout sets endedAt on first call and keeps it idempotent on re-call", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: CreatedWorkout | undefined;
    act(() => {
      created = result.current.createWorkout();
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(created!.id),
    );

    act(() => {
      result.current.endWorkout(created!.id);
    });
    await waitFor(() =>
      expect(
        result.current.workouts.find((w) => w.id === created!.id)?.endedAt,
      ).toBeTruthy(),
    );
    const firstEndedAt = result.current.workouts.find(
      (w) => w.id === created!.id,
    )?.endedAt;

    // Re-ending must NOT bump endedAt: the workout is already ended.
    act(() => {
      result.current.endWorkout(created!.id);
    });
    const after = result.current.workouts.find((w) => w.id === created!.id);
    expect(after?.endedAt).toBe(firstEndedAt);
  });

  it("endWorkout is a no-op for an unknown id", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.endWorkout("does-not-exist");
    });
    expect(result.current.workouts).toHaveLength(0);
  });

  it("loads existing workouts from storage and re-ending them is idempotent", async () => {
    const existing: Workout = {
      id: "pre-existing",
      startedAt: new Date("2025-01-01T10:00:00Z").toISOString(),
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    seedWorkouts([existing]);

    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(
        "pre-existing",
      ),
    );

    act(() => {
      result.current.endWorkout("pre-existing");
    });
    await waitFor(() =>
      expect(
        result.current.workouts.find((w) => w.id === "pre-existing")?.endedAt,
      ).toBeTruthy(),
    );
    const firstEndedAt = result.current.workouts.find(
      (w) => w.id === "pre-existing",
    )?.endedAt;

    act(() => {
      result.current.endWorkout("pre-existing");
    });
    const again = result.current.workouts.find((w) => w.id === "pre-existing");
    expect(again?.endedAt).toBe(firstEndedAt);
  });
});
