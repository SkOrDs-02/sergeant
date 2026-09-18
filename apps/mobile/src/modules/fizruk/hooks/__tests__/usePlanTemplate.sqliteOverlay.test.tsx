/**
 * Overlay tests for `usePlanTemplate` (Stage 12.5 / PR
 * #057f2-tombstone-mobile-stage12-5 — mobile).
 *
 * Verifies that the hook reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState()`) once it has been refreshed at least
 * once. Cold cache (`refreshedAt === null`) yields `null`. Setting a
 * plan-template no longer writes to MMKV — the dual-write trigger is
 * fire-and-forget and never throws.
 */
import { act, renderHook } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../lib/sqliteReadGate";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
} from "../../lib/sqliteReader";
import { usePlanTemplate } from "../usePlanTemplate";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("usePlanTemplate — SQLite read overlay (Stage 12.5)", () => {
  it("does NOT overlay when the cache is cold (refreshedAt === null)", () => {
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => usePlanTemplate());

    expect(result.current.planTemplate).toBeNull();
  });

  it("overlays plan-template from the SQLite warm cache", () => {
    __setFizrukSqliteCacheForTests({
      planTemplate: {
        dataJson: JSON.stringify({
          name: "PPL split",
          weekday: { "0": "tpl-push", "1": "tpl-pull" },
        }),
      },
    });

    const { result } = renderHook(() => usePlanTemplate());

    expect(result.current.planTemplate).toMatchObject({
      name: "PPL split",
      weekday: { "0": "tpl-push", "1": "tpl-pull" },
    });
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      planTemplate: { dataJson: JSON.stringify({ name: "Initial" }) },
    });

    const { result } = renderHook(() => usePlanTemplate());
    expect(result.current.planTemplate?.name).toBe("Initial");

    __setFizrukSqliteCacheForTests({
      planTemplate: { dataJson: JSON.stringify({ name: "Updated" }) },
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.planTemplate?.name).toBe("Updated");
  });

  it("collapses the `'null'` JSON sentinel onto a `null` template", () => {
    __setFizrukSqliteCacheForTests({
      planTemplate: { dataJson: "null" },
    });

    const { result } = renderHook(() => usePlanTemplate());
    expect(result.current.planTemplate).toBeNull();
  });

  it("collapses malformed JSON onto a `null` template", () => {
    __setFizrukSqliteCacheForTests({
      planTemplate: { dataJson: "not-json" },
    });

    const { result } = renderHook(() => usePlanTemplate());
    expect(result.current.planTemplate).toBeNull();
  });

  it("setPlanTemplate no longer writes to MMKV (Stage 12.5 tombstone)", () => {
    const { result } = renderHook(() => usePlanTemplate());

    act(() => {
      result.current.setPlanTemplate({ name: "fresh" });
    });

    // Stage 12.5 tombstone — no MMKV write at all.
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE)).toBe(
      false,
    );
    // …but in-memory state still updates so the UI reflects it.
    expect(result.current.planTemplate?.name).toBe("fresh");
  });

  it("setPlanTemplate is a no-op for deep-equal payloads", () => {
    __setFizrukSqliteCacheForTests({
      planTemplate: { dataJson: JSON.stringify({ name: "stable" }) },
    });

    const { result } = renderHook(() => usePlanTemplate());
    const before = result.current.planTemplate;

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.setPlanTemplate({ name: "stable" });
    });

    expect(returned).toBe(false);
    expect(result.current.planTemplate).toBe(before);
  });
});
