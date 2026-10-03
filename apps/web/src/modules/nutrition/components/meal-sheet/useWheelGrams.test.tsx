// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Регресія N2 (знахідка власника: «обираю через чек або пошук — колесо
 * кілька разів стрибає туди-сюди»). Дві з чотирьох причин жили у входах
 * колеса, і обидві перевіряються тут.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWheelGrams } from "./useWheelGrams";

describe("useWheelGrams", () => {
  it("keeps an off-grid weight in the list after the wheel moves on", () => {
    // Головна причина стрибка. Список виводився з поточного значення:
    // 150.5 з чека потрапляло в масив, а після коміту на 200 зникало —
    // довжина мінялась на 1, усі індекси після 150 зсувались назад, і
    // колесо доїжджало на рядок убік ПІСЛЯ КОЖНОГО коміту.
    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useWheelGrams(raw),
      { initialProps: { raw: "150.5" } },
    );

    const withExtra = result.current.values;
    expect(withExtra).toContain(150.5);
    expect(result.current.value).toBe(150.5);

    rerender({ raw: "200" });

    expect(result.current.values).toContain(150.5);
    expect(result.current.values).toHaveLength(withExtra.length);
    expect(result.current.value).toBe(200);
  });

  it("leaves the wheel where it is while the field is empty", () => {
    // `Number(pickedGrams) || 100` давало 100 і для порожнього рядка, і
    // для «0» — тобто рівно тоді, коли людина стерла значення, щоб
    // набрати інше. Колесо смикалось на 100 посеред набору.
    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useWheelGrams(raw),
      { initialProps: { raw: "250" } },
    );
    expect(result.current.value).toBe(250);

    rerender({ raw: "" });
    expect(result.current.value).toBe(250);

    rerender({ raw: "0" });
    expect(result.current.value).toBe(250);
  });

  it("does not grow the list for values already on the grid", () => {
    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useWheelGrams(raw),
      { initialProps: { raw: "100" } },
    );
    const base = result.current.values;

    rerender({ raw: "355" });
    rerender({ raw: "1050" });

    expect(result.current.values).toHaveLength(base.length);
    expect(result.current.values).toBe(base);
  });

  it("accepts a comma decimal, as the grams field emits it", () => {
    const { result } = renderHook(() => useWheelGrams("33,5"));
    expect(result.current.value).toBe(33.5);
    expect(result.current.values).toContain(33.5);
  });

  it("ignores a weight above the portion ceiling", () => {
    const { result } = renderHook(() => useWheelGrams("99999"));
    expect(result.current.value).toBe(100);
    expect(result.current.values).not.toContain(99999);
  });
});
