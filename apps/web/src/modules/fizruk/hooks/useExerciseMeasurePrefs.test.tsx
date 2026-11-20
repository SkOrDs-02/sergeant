// @vitest-environment jsdom
/**
 * `useExerciseMeasurePrefs` — памʼять типу виміру вправи (спека
 * `fizruk-exercise-measure-type.md`, зріз 5). Мокається лише межа dual-write,
 * diff справжній (`diffFizrukDualWriteOps`), як у `useInjuries.test.tsx`.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { useExerciseMeasurePrefs } from "./useExerciseMeasurePrefs";

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ exercisePrefs: {} });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

function allOps() {
  return vi
    .mocked(triggerFizrukDualWrite)
    .mock.calls.flatMap(([prev, next]) => diffFizrukDualWriteOps(prev, next));
}

describe("useExerciseMeasurePrefs", () => {
  it("вибір не-дефолтного типу пише рядок памʼяті", () => {
    const { result } = renderHook(() => useExerciseMeasurePrefs());
    act(() => result.current.rememberMeasure("plank", "reps"));
    expect(result.current.prefs).toEqual({ plank: "reps" });
    expect(allOps()).toEqual([
      { kind: "exercise-pref-upsert", pref: { id: "plank", measure: "reps" } },
    ]);
  });

  it("повернення на дефолт каталогу видаляє рядок (soft-delete)", () => {
    __setFizrukSqliteCacheForTests({ exercisePrefs: { plank: "reps" } });
    const { result } = renderHook(() => useExerciseMeasurePrefs());
    act(() => result.current.rememberMeasure("plank", "time"));
    expect(result.current.prefs).toEqual({});
    expect(allOps()).toEqual([
      { kind: "exercise-pref-delete", exerciseId: "plank" },
    ]);
  });

  it("дефолт без памʼяті — нічого не пише", () => {
    const { result } = renderHook(() => useExerciseMeasurePrefs());
    act(() => result.current.rememberMeasure("plank", "time"));
    expect(triggerFizrukDualWrite).not.toHaveBeenCalled();
  });

  it("власна вправа: дефолт — її поле `measure`", () => {
    __setFizrukSqliteCacheForTests({
      exercisePrefs: {},
      customExercises: [
        { id: "my_hold", measure: "time", primaryGroup: "core" } as never,
      ],
    });
    const { result } = renderHook(() => useExerciseMeasurePrefs());
    act(() => result.current.rememberMeasure("my_hold", "time"));
    expect(triggerFizrukDualWrite).not.toHaveBeenCalled();
    act(() => result.current.rememberMeasure("my_hold", "weight_time"));
    expect(result.current.prefs).toEqual({ my_hold: "weight_time" });
  });
});
