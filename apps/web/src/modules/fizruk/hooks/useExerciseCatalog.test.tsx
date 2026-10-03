// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useExerciseCatalog } from "./useExerciseCatalog";

describe("useExerciseCatalog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes the static catalog metadata and a non-empty exercise list", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    expect(result.current.catalogLoading).toBe(false);
    expect(Array.isArray(result.current.exercises)).toBe(true);
    expect(result.current.exercises.length).toBeGreaterThan(0);
    expect(result.current.primaryGroupsUk).toBeDefined();
    expect(result.current.musclesUk).toBeDefined();
    expect(result.current.customExercises).toEqual([]);
  });

  it("search('') returns the full list", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    expect(result.current.search("")).toBe(result.current.exercises);
  });

  it("search filters by a query and returns a subset", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    const all = result.current.exercises;
    const first = all[0]!;
    const name = (first.name?.uk ?? "").slice(0, 3);
    const filtered = result.current.search(name);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  // Браузерне QA 2026-08-23: пошук «спина» повертав 0 результатів, хоча
  // плейсхолдер поля рекламує саме цей запит, а в групі 13 вправ.
  // Причина — індексувались лише НАЗВИ й порожнє поле `primaryGroupUk`.
  it("search matches a muscle group by its Ukrainian label", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    const back = result.current.search("спина");
    const backIds = new Set(back.map((ex) => ex.id));
    const wholeGroup = result.current.exercises.filter(
      (ex) => ex.primaryGroup === "back",
    );
    expect(wholeGroup.length).toBeGreaterThan(0);
    expect(wholeGroup.every((ex) => backIds.has(ex.id))).toBe(true);

    const chest = result.current.search("груди");
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.some((ex) => ex.primaryGroup === "chest")).toBe(true);
  });

  it("search still matches exercise names (жим, присід)", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    const press = result.current.search("жим");
    expect(press.length).toBeGreaterThan(0);
    expect(
      press.some((ex) => (ex.name?.uk ?? "").toLowerCase().includes("жим")),
    ).toBe(true);

    const squat = result.current.search("присід");
    expect(squat.length).toBeGreaterThan(0);
  });

  it("search returns nothing for a query that matches no exercise", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    expect(result.current.search("щось-чого-точно-немає")).toHaveLength(0);
  });

  it("addExercise prepends a custom entry and removeExercise removes it", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    act(() => {
      result.current.addExercise({
        id: "custom-1",
        name: { uk: "Моя вправа" },
      } as never);
    });
    expect(
      result.current.customExercises.some((e) => e?.id === "custom-1"),
    ).toBe(true);

    let removed = false;
    act(() => {
      removed = result.current.removeExercise("custom-1");
    });
    expect(removed).toBe(true);
    expect(
      result.current.customExercises.some((e) => e?.id === "custom-1"),
    ).toBe(false);
  });

  it("addExercise validates id and name.uk", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    expect(() =>
      act(() => {
        result.current.addExercise({ name: { uk: "x" } } as never);
      }),
    ).toThrow(/id is required/);
    expect(() =>
      act(() => {
        result.current.addExercise({ id: "z" } as never);
      }),
    ).toThrow(/name.uk is required/);
  });

  it("removeExercise returns false for unknown / empty id", () => {
    const { result } = renderHook(() => useExerciseCatalog());
    let r1 = true;
    let r2 = true;
    act(() => {
      r1 = result.current.removeExercise("");
      r2 = result.current.removeExercise("does-not-exist");
    });
    expect(r1).toBe(false);
    expect(r2).toBe(false);
  });
});
