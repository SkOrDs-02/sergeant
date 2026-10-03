// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// triggerFizrukDualWrite mirrors into SQLite (async, needs a warm DB). Stub it
// so persist* helpers exercise their pure pre-write logic + LS write without a
// real dual-write pipeline. A spy lets us assert the trigger is invoked.
const trigger = vi.hoisted(() => vi.fn());
vi.mock("../../../../modules/fizruk/lib/sqliteWriter/index", async (orig) => ({
  ...(await orig<
    typeof import("../../../../modules/fizruk/lib/sqliteWriter/index")
  >()),
  triggerFizrukDualWrite: trigger,
}));

import {
  readWorkouts,
  readFizrukWorkouts,
  persistFizrukWorkouts,
  readFizrukDailyLog,
  persistFizrukDailyLog,
  deleteFizrukDailyLogEntry,
} from "./shared";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";

beforeEach(() => {
  localStorage.clear();
  clearFizrukSqliteCache();
  vi.clearAllMocks();
});
afterEach(() => {
  localStorage.clear();
  clearFizrukSqliteCache();
});

describe("readWorkouts", () => {
  it("returns an array stored directly under the LS key", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify([{ id: "w1" }, { id: "w2" }]),
    );
    expect(readWorkouts()).toHaveLength(2);
  });

  it("unwraps the workouts-envelope object shape", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify({ workouts: [{ id: "w1" }] }),
    );
    const out = readWorkouts();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("w1");
  });

  it("returns [] for missing or non-conforming data", () => {
    expect(readWorkouts()).toEqual([]);
    localStorage.setItem("fizruk_workouts_v1", JSON.stringify({ other: 1 }));
    expect(readWorkouts()).toEqual([]);
  });
});

describe("readFizrukWorkouts", () => {
  it("returns [] when the SQLite cache is cold (refreshedAt null)", () => {
    expect(readFizrukWorkouts()).toEqual([]);
  });

  it("returns cached workouts when the cache is warm", () => {
    __setFizrukSqliteCacheForTests({
      workouts: [
        { id: "w1", date: "2026-06-01", items: [] },
      ] as unknown as never,
    });
    const out = readFizrukWorkouts();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("w1");
  });
});

describe("persistFizrukWorkouts", () => {
  it("fires the dual-write trigger with the new workout list", () => {
    persistFizrukWorkouts([] as never);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("never throws when the trigger rejects (fire-and-forget)", () => {
    trigger.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => persistFizrukWorkouts([] as never)).not.toThrow();
  });
});

describe("readFizrukDailyLog", () => {
  it("reads the SQLite warm-cache, not the tombstoned LS key", () => {
    localStorage.setItem(
      "fizruk_daily_log_v1",
      JSON.stringify([{ id: "stale", at: "2026-06-01T00:00:00Z" }]),
    );
    __setFizrukSqliteCacheForTests({
      dailyLog: [
        {
          id: "d1",
          at: "2026-06-02T00:00:00Z",
          weightKg: 80,
          sleepHours: null,
          energyLevel: null,
          moodScore: null,
          note: "",
        },
      ],
    });
    expect(readFizrukDailyLog().map((e) => e.id)).toEqual(["d1"]);
  });

  it("returns [] before the cache has been refreshed", () => {
    expect(readFizrukDailyLog()).toEqual([]);
  });
});

describe("persistFizrukDailyLog", () => {
  it("fires the dual-write trigger and never touches LS", () => {
    const entries = [
      { id: "d1", at: "2026-06-01T00:00:00Z", weightKg: 80 },
    ] as never;
    persistFizrukDailyLog(entries);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("fizruk_daily_log_v1")).toBeNull();
  });

  it("never throws when the trigger rejects", () => {
    trigger.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => persistFizrukDailyLog([] as never)).not.toThrow();
  });
});

describe("deleteFizrukDailyLogEntry", () => {
  const ENTRY = {
    id: "dl_new",
    at: "2026-06-03T00:00:00Z",
    weightKg: 79,
    sleepHours: null,
    energyLevel: null,
    moodScore: null,
    note: "",
  };

  it("emits the delete even when the cache does not know the entry yet", () => {
    __setFizrukSqliteCacheForTests({ dailyLog: [] });
    deleteFizrukDailyLogEntry(ENTRY);
    const [prev, next] = trigger.mock.calls.at(-1)!;
    expect(prev.dailyLog.map((e: { id: string }) => e.id)).toEqual(["dl_new"]);
    expect(next.dailyLog).toEqual([]);
  });

  it("does not duplicate the entry when the cache already has it", () => {
    __setFizrukSqliteCacheForTests({ dailyLog: [ENTRY] });
    deleteFizrukDailyLogEntry(ENTRY);
    const [prev, next] = trigger.mock.calls.at(-1)!;
    expect(prev.dailyLog.map((e: { id: string }) => e.id)).toEqual(["dl_new"]);
    expect(next.dailyLog).toEqual([]);
  });
});
