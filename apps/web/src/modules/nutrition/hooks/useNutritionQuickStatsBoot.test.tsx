// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { state, writeSnapshotMock } = vi.hoisted(() => ({
  state: {
    tick: 0,
    cache: {
      refreshedAt: null as string | null,
      log: {} as Record<string, unknown>,
      prefs: null as { dailyTargetKcal: number } | null,
    },
  },
  writeSnapshotMock: vi.fn(),
}));

vi.mock("../lib/sqliteReadGate", () => ({
  useNutritionSqliteReadTick: () => state.tick,
}));
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => state.cache,
}));
vi.mock("./useNutritionQuickStatsWriter", () => ({
  writeNutritionQuickStatsSnapshot: writeSnapshotMock,
}));

import { useNutritionQuickStatsBoot } from "./useNutritionQuickStatsBoot";

describe("useNutritionQuickStatsBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tick = 0;
    state.cache.refreshedAt = null;
    state.cache.log = {};
    state.cache.prefs = null;
  });

  it("waits for the canonical cache before rebuilding the Hub snapshot", () => {
    const { rerender } = renderHook(() => useNutritionQuickStatsBoot());
    // Порожній кеш на холодному старті — писати нулі поверх корисного знімка
    // не можна.
    expect(writeSnapshotMock).not.toHaveBeenCalled();

    state.cache.refreshedAt = "2026-08-05T09:00:00.000Z";
    state.cache.log = { "2026-08-05": { meals: [] } };
    state.cache.prefs = { dailyTargetKcal: 1800 };
    state.tick += 1;
    rerender();

    expect(writeSnapshotMock).toHaveBeenCalledTimes(1);
    expect(writeSnapshotMock).toHaveBeenCalledWith({
      log: state.cache.log,
      prefs: state.cache.prefs,
    });
  });

  it("still rebuilds the snapshot when the user has no calorie goal", () => {
    state.cache.refreshedAt = "2026-08-05T09:00:00.000Z";
    state.cache.log = { "2026-08-05": { meals: [] } };
    state.cache.prefs = null;

    renderHook(() => useNutritionQuickStatsBoot());

    expect(writeSnapshotMock).toHaveBeenCalledWith({
      log: state.cache.log,
      prefs: null,
    });
  });
});
