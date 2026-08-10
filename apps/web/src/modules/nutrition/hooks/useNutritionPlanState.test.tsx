// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useNutritionPlanState } from "./useNutritionPlanState";
import { loadDayPlan, loadWeekPlan } from "../lib/planStorage";

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

  it("не «омолоджує» savedAt денного плану на перемонтуванні", () => {
    // Перемонтування — не генерація. Якби ефект запису відпрацював на маунті,
    // `savedAt` ставав би часом останнього відкриття модуля, і мітка, заради
    // якої вона й існує (показати, коли план згенеровано), брехала б.
    //
    // Годинник підмінено навмисно: без цього обидва записи впали б в одну
    // мілісекунду і тест проходив би вхолосту, нічого не доводячи.
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setDayPlan(PLAN);
    });
    first.unmount();
    const savedAt = loadDayPlan()?.savedAt;

    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue((savedAt ?? 0) + 60_000);
    renderHook(() => useNutritionPlanState()).unmount();
    clock.mockRestore();

    expect(loadDayPlan()?.savedAt).toBe(savedAt);
  });

  it("не «омолоджує» savedAt тижневого плану на перемонтуванні", () => {
    const first = renderHook(() => useNutritionPlanState());
    act(() => {
      first.result.current.setWeekPlan({ days: [{ day: "Пн" }] });
    });
    first.unmount();
    const savedAt = loadWeekPlan()?.savedAt;

    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue((savedAt ?? 0) + 60_000);
    renderHook(() => useNutritionPlanState()).unmount();
    clock.mockRestore();

    expect(loadWeekPlan()?.savedAt).toBe(savedAt);
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
