// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { useWorkouts } from "./useWorkouts";

const WORKOUT: Workout = {
  id: "w_seed_1",
  startedAt: "2026-09-16T07:00:00.000Z",
  endedAt: "2026-09-16T08:00:00.000Z",
  items: [],
  groups: [],
  warmup: null,
  cooldown: null,
  note: "",
};

function lastOpKinds() {
  const call = vi.mocked(triggerFizrukDualWrite).mock.calls.at(-1);
  if (!call) throw new Error("triggerFizrukDualWrite was not called");
  return diffFizrukDualWriteOps(call[0], call[1]).map((op) => op.kind);
}

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ workouts: [WORKOUT] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useWorkouts — undo, поки delete ще в черзі dual-write", () => {
  it("«видалити → Повернути» до refresh кешу дає upsert тренування", () => {
    const { result } = renderHook(() => useWorkouts());
    act(() => {
      result.current.deleteWorkout(WORKOUT.id);
    });
    expect(lastOpKinds()).toEqual(["workout-delete"]);

    act(() => {
      result.current.restoreWorkout(WORKOUT);
    });
    expect(result.current.workouts.map((w) => w.id)).toEqual([WORKOUT.id]);
    expect(lastOpKinds()).toEqual(["workout-upsert"]);
  });
});
