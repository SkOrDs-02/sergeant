// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// triggerFizrukDualWrite mirrors into SQLite (async, needs a warm DB). Stub it
// so persist* helpers exercise their pure pre-write logic + LS write without a
// real dual-write pipeline. A spy lets us assert the trigger is invoked.
const trigger = vi.hoisted(() => vi.fn());
vi.mock("../../../../modules/fizruk/lib/dualWrite/index", async (orig) => ({
  ...(await orig<
    typeof import("../../../../modules/fizruk/lib/dualWrite/index")
  >()),
  triggerFizrukDualWrite: trigger,
}));

import {
  readWorkouts,
  readFizrukWorkouts,
  persistFizrukWorkouts,
  readFizrukDailyLog,
  persistFizrukDailyLog,
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
  it("returns the stored daily-log array", () => {
    localStorage.setItem(
      "fizruk_daily_log_v1",
      JSON.stringify([{ id: "d1", at: "2026-06-01T00:00:00Z" }]),
    );
    const out = readFizrukDailyLog();
    expect(out).toHaveLength(1);
  });

  it("returns [] when stored value is not an array", () => {
    localStorage.setItem("fizruk_daily_log_v1", JSON.stringify({ bad: 1 }));
    expect(readFizrukDailyLog()).toEqual([]);
  });

  it("returns [] when key is absent", () => {
    expect(readFizrukDailyLog()).toEqual([]);
  });
});

describe("persistFizrukDailyLog", () => {
  it("writes LS and fires the dual-write trigger", () => {
    const entries = [
      { id: "d1", at: "2026-06-01T00:00:00Z", weightKg: 80 },
    ] as never;
    persistFizrukDailyLog(entries);
    const stored = JSON.parse(
      localStorage.getItem("fizruk_daily_log_v1") || "null",
    );
    expect(stored).toHaveLength(1);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("never throws when the trigger rejects", () => {
    trigger.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => persistFizrukDailyLog([] as never)).not.toThrow();
    // LS write still happened before the trigger.
    expect(localStorage.getItem("fizruk_daily_log_v1")).toBe("[]");
  });
});
