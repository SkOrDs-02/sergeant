// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useNutritionPlanState } from "./useNutritionPlanState";

const PLAN = {
  meals: [{ type: "lunch", title: "Гречка з куркою", kcal: 610 }],
  totalKcal: 610,
};

describe("useNutritionPlanState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("починає з порожнього стану, коли в сховищі нічого немає", () => {
    const { result } = renderHook(() => useNutritionPlanState());
    expect(result.current.dayPlan).toBeNull();
    expect(result.current.weekPlan).toBeNull();
    expect(result.current.weekPlanRaw).toBe("");
  });

  it("повертає денний план після перемонтування — власне репорт тестера", () => {
    // Перемонтування тут моделює і закриття застосунку, і перехід
    // «Хаб → Харчування»: `/nutrition/*` — lazy-роут, тож `NutritionApp`
    // розмонтовується в обох випадках однаково.
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setDayPlan(PLAN);
    });
    first.unmount();

    const second = renderHook(() => useNutritionPlanState());
    expect(second.result.current.dayPlan).toEqual(PLAN);
  });

  it("повертає тижневий план разом із сирим текстом", () => {
    const weekPlan = { days: [{ day: "Пн", meals: [] }] };
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setWeekPlan(weekPlan);
      first.result.current.setWeekPlanRaw("сирий текст");
    });
    first.unmount();

    const second = renderHook(() => useNutritionPlanState());
    expect(second.result.current.weekPlan).toEqual(weekPlan);
    expect(second.result.current.weekPlanRaw).toBe("сирий текст");
  });

  it("НЕ затирає збережений план на першому рендері", () => {
    // Регресійний пін на причину, через яку тут lazy-`useState`, а не
    // гідрація в ефекті: ефект запису відпрацював би раніше за гідрацію і
    // зніс би збережений план початковим `null`.
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setDayPlan(PLAN);
    });
    first.unmount();

    renderHook(() => useNutritionPlanState()).unmount();

    const third = renderHook(() => useNutritionPlanState());
    expect(third.result.current.dayPlan).toEqual(PLAN);
  });

  it("прибирає план зі сховища, коли його знято", () => {
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setDayPlan(PLAN);
    });
    act(() => {
      first.result.current.setDayPlan(null);
    });
    first.unmount();

    const second = renderHook(() => useNutritionPlanState());
    expect(second.result.current.dayPlan).toBeNull();
  });
});
