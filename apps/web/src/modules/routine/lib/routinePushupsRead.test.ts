// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPushupHistoryFromRoutine } from "./routinePushupsRead";
import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "./sqliteReader";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 5, 0, 30));
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
});

afterEach(() => {
  vi.useRealTimers();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
});

describe("buildPushupHistoryFromRoutine", () => {
  it("reads local date keys exactly and fills missing days with zeroes", () => {
    __setRoutineSqliteStateCacheForTests({
      pushupsByDate: {
        "2026-01-03": 12,
        "2026-01-05": 7,
      },
    });

    expect(buildPushupHistoryFromRoutine(3)).toEqual([
      { date: "2026-01-03", total: 12 },
      { date: "2026-01-04", total: 0 },
      { date: "2026-01-05", total: 7 },
    ]);
  });
});
