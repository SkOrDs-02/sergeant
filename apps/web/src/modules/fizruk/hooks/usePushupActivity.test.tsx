// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../routine/lib/sqliteReader";
import { usePushupActivity } from "./usePushupActivity";

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

describe("usePushupActivity", () => {
  it("aggregates stats with local day keys from Routine history", () => {
    __setRoutineSqliteStateCacheForTests({
      pushupsByDate: {
        "2025-12-06": 2,
        "2025-12-29": 5,
        "2026-01-05": 9,
      },
    });

    const { result } = renderHook(() => usePushupActivity(31));

    expect(result.current.stats).toEqual({
      todayCount: 9,
      week: 14,
      month: 16,
    });
    expect(result.current.hasData).toBe(true);
  });
});
