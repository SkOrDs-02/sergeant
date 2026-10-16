// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateInsights } from "./insightsEngine";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../modules/fizruk/lib/sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../modules/finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  localStorage.clear();
  __setFizrukSqliteCacheForTests({
    workouts: [0, 1].flatMap((week) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `w${week}-${i}`,
        startedAt: new Date(Date.UTC(2026, 9, 13 - 7 * week, 10)).toISOString(),
        endedAt: new Date(Date.UTC(2026, 9, 13 - 7 * week, 11)).toISOString(),
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      })),
    ),
  });
  __setFinykMonoMirrorCacheForTests({ transactions: [] });
  __setFinykSqliteStateCacheForTests({
    manualExpenses: [0, 1, 2, 3].map((week) => ({
      id: `expense${week}`,
      date: `2026-${week === 3 ? "09-22" : week === 2 ? "09-29" : week === 1 ? "10-06" : "10-13"}`,
      amount: week < 2 ? 100 : 1000,
      category: "food",
      description: "Продукти",
    })),
  });
});
afterEach(() => {
  vi.useRealTimers();
  clearFizrukSqliteCache();
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
});

it("uses canonical expenses with no legacy LS shards to calculate active-week spending", () => {
  expect(
    generateInsights().find((r) => r.id === "active_weeks_spending"),
  ).toMatchObject({ stat: "−90%" });
});
