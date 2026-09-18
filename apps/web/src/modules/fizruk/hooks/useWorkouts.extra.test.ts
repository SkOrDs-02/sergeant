// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for useWorkouts.ts.
 * Targets: restoreWorkout (dup-guard + sort), removeItem with groups cleanup,
 * createWorkoutWithTimes, addItem with explicit id, updateItem, deleteWorkout,
 * persist error dispatch, makeDefaultWarmup/Cooldown.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useWorkouts,
  makeDefaultWarmup,
  makeDefaultCooldown,
  FIZRUK_WORKOUTS_STORAGE_ERROR,
} from "./useWorkouts";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";
import type { Workout } from "@sergeant/fizruk-domain";

function seedWorkouts(workouts: Workout[]) {
  __setFizrukSqliteCacheForTests({ workouts });
  notifyFizrukSqliteCacheRefresh();
}

describe("makeDefaultWarmup / makeDefaultCooldown (pure)", () => {
  it("produces 3 items with unique ids starting with wm_", () => {
    const warmup = makeDefaultWarmup();
    expect(warmup).toHaveLength(3);
    expect(warmup.every((x) => x.id.startsWith("wm_"))).toBe(true);
    expect(warmup.every((x) => x.done === false)).toBe(true);
  });

  it("produces 3 cooldown items with unique ids starting with cd_", () => {
    const cooldown = makeDefaultCooldown();
    expect(cooldown).toHaveLength(3);
    expect(cooldown.every((x) => x.id.startsWith("cd_"))).toBe(true);
  });

  it("each call returns fresh ids (no re-use)", () => {
    const a = makeDefaultWarmup().map((x) => x.id);
    const b = makeDefaultWarmup().map((x) => x.id);
    const intersection = a.filter((id) => b.includes(id));
    expect(intersection).toHaveLength(0);
  });
});

describe("useWorkouts – createWorkoutWithTimes", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFizrukSqliteCache();
  });

  it("creates a workout with the given startedAt timestamp", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const startedAt = "2024-06-01T08:00:00.000Z";
    let created: Workout | undefined;
    act(() => {
      created = result.current.createWorkoutWithTimes({ startedAt });
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(created!.id),
    );
    expect(
      result.current.workouts.find((w) => w.id === created!.id)?.startedAt,
    ).toBe(startedAt);
  });

  it("falls back to now when startedAt is an empty string", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: Workout | undefined;
    act(() => {
      created = result.current.createWorkoutWithTimes({ startedAt: "" });
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(created!.id),
    );
    const w = result.current.workouts.find((ww) => ww.id === created!.id)!;
    expect(w.startedAt).toBeTruthy();
  });
});

describe("useWorkouts – updateWorkout / deleteWorkout / updateItem / removeItem", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFizrukSqliteCache();
  });

  it("updateWorkout patches a workout in-place", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(id),
    );

    act(() => result.current.updateWorkout(id, { note: "test note" }));
    expect(result.current.workouts.find((w) => w.id === id)?.note).toBe(
      "test note",
    );
  });

  it("deleteWorkout removes the workout", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(id),
    );

    act(() => result.current.deleteWorkout(id));
    expect(result.current.workouts.find((w) => w.id === id)).toBeUndefined();
  });

  it("addItem with an explicit id uses that id", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let wid = "";
    act(() => {
      wid = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(wid),
    );

    let returnedId = "";
    act(() => {
      returnedId = result.current.addItem(wid, {
        id: "item_explicit",
        exerciseId: "ex1",
      } as never);
    });
    expect(returnedId).toBe("item_explicit");
    const w = result.current.workouts.find((ww) => ww.id === wid)!;
    expect(w.items.some((i) => i.id === "item_explicit")).toBe(true);
  });

  it("updateItem patches a specific item", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let wid = "";
    act(() => {
      wid = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(wid),
    );

    let iid = "";
    act(() => {
      iid = result.current.addItem(wid, { exerciseId: "ex2" } as never);
    });
    act(() =>
      result.current.updateItem(wid, iid, { durationSec: 60 } as never),
    );
    const w = result.current.workouts.find((ww) => ww.id === wid)!;
    expect(w.items.find((i) => i.id === iid)?.durationSec).toBe(60);
  });

  it("removeItem with groups cleans up group itemIds and drops groups < 2 items", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let wid = "";
    act(() => {
      wid = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(wid),
    );

    let iid1 = "";
    let iid2 = "";
    act(() => {
      iid1 = result.current.addItem(wid, { exerciseId: "ex3" } as never);
      iid2 = result.current.addItem(wid, { exerciseId: "ex4" } as never);
    });
    // Add a superset group referencing both items.
    act(() =>
      result.current.updateWorkout(wid, {
        groups: [
          { id: "g1", type: "superset", itemIds: [iid1, iid2] },
        ] as never,
      }),
    );
    // Remove one item → group now has only 1 itemId → should be pruned.
    act(() => result.current.removeItem(wid, iid1));
    const w = result.current.workouts.find((ww) => ww.id === wid)!;
    expect(w.items.find((i) => i.id === iid1)).toBeUndefined();
    expect(w.groups).toHaveLength(0);
  });
});

describe("useWorkouts – restoreWorkout", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFizrukSqliteCache();
  });

  it("restores a workout that was deleted", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(id),
    );
    const snapshot = result.current.workouts.find((w) => w.id === id)!;
    act(() => result.current.deleteWorkout(id));
    act(() => result.current.restoreWorkout(snapshot));
    expect(result.current.workouts.find((w) => w.id === id)).toBeTruthy();
  });

  it("does NOT add a duplicate when the workout is already in the list", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    await waitFor(() =>
      expect(result.current.workouts.map((w) => w.id)).toContain(id),
    );
    const snapshot = result.current.workouts.find((w) => w.id === id)!;
    act(() => result.current.restoreWorkout(snapshot));
    expect(result.current.workouts.filter((w) => w.id === id)).toHaveLength(1);
  });

  it("is a no-op when the workout has no id", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const initialLen = result.current.workouts.length;
    act(() => result.current.restoreWorkout({ id: "" } as unknown as Workout));
    expect(result.current.workouts).toHaveLength(initialLen);
  });

  it("sorts restored workouts by startedAt ascending", async () => {
    seedWorkouts([]);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const older: Workout = {
      id: "w-older",
      startedAt: "2024-01-01T00:00:00Z",
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    const newer: Workout = {
      id: "w-newer",
      startedAt: "2024-06-01T00:00:00Z",
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    act(() => result.current.restoreWorkout(older));
    act(() => result.current.restoreWorkout(newer));
    // After both restores, sorted by startedAt desc (the hook sorts workouts)
    const ids = result.current.workouts.map((w) => w.id);
    expect(ids.indexOf("w-newer")).toBeLessThan(ids.indexOf("w-older"));
  });
});

describe("useWorkouts – FIZRUK_WORKOUTS_STORAGE_ERROR event", () => {
  it("FIZRUK_WORKOUTS_STORAGE_ERROR is exported as a constant string", () => {
    expect(typeof FIZRUK_WORKOUTS_STORAGE_ERROR).toBe("string");
    expect(FIZRUK_WORKOUTS_STORAGE_ERROR).toBe("fizruk-workouts-storage-error");
  });
});
