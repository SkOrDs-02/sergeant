// @vitest-environment jsdom
/**
 * Last validated: 2026-10-02
 * Status: Active
 * Регресія data-03: маунт `useShoppingList` на холодному кеші не має
 * породжувати жодного sync-опу (інакше порожній дефолт затирає реальний
 * список на сервері whole-row LWW-ом).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
  };
});

import { diffNutritionDualWriteOps } from "../lib/sqliteWriter/diff";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState";
import { useShoppingList } from "./useShoppingList";

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  triggerSpy.mockReset();
});

afterEach(() => {
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
});

function emittedOps(): unknown[] {
  return triggerSpy.mock.calls.flatMap(([prev, next]) =>
    diffNutritionDualWriteOps(prev, next),
  );
}

describe("useShoppingList — холодний кеш (data-03)", () => {
  it("маунт з refreshedAt === null не породжує жодного опа", () => {
    renderHook(() => useShoppingList());
    expect(emittedOps()).toEqual([]);
  });

  it("правка до прогріву не пишеться", () => {
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.addItem({ name: "Молоко" }));
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("новий пристрій: кеш прогрітий, рядка списку ще немає (null) — маунт без опів", () => {
    __setNutritionSqliteCacheForTests({ shoppingList: null });
    renderHook(() => useShoppingList());
    expect(emittedOps()).toEqual([]);
  });

  it("data-04: кеш прогрітий, але початковий pull ще не завершено — правка не пишеться", () => {
    // `refreshedAt !== null` лише означає, що ЛОКАЛЬНИЙ бут завершився (на
    // новому пристрої — з порожньою базою). Справжній список ще в дорозі.
    __setNutritionSqliteCacheForTests({ shoppingList: null });
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.addItem({ name: "Молоко" }));
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("після прогріву і початкового pull звичайна правка пишеться", () => {
    __setNutritionSqliteCacheForTests({ shoppingList: null });
    markInitialPullComplete("user-1", {});
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.addItem({ name: "Молоко" }));
    const ops = emittedOps() as { kind: string }[];
    expect(ops.map((o) => o.kind)).toEqual(["shopping-list-set"]);
  });
});
