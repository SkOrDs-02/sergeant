// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@shared/hooks/useToast";
import { useNutritionLog } from "./useNutritionLog";
import { clearNutritionSqliteCache } from "../lib/sqliteReader";

/**
 * data-42 (аудит 2026-10-01): `selectedDate` раніше обчислювався один раз у
 * `useState`, тож PWA, лишена відкритою через північ, клала сніданок у
 * вчорашній день. ADR-0078: межа доби — годинник ПРИСТРОЮ. Vitest пінить
 * `TZ=UTC`, тому «пристрій» тут і є UTC.
 */
const BEFORE_MIDNIGHT = "2026-10-01T23:58:00Z";
const AFTER_MIDNIGHT = "2026-10-02T07:58:00Z";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <ToastProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ToastProvider>
  );
}

function wakeAt(iso: string) {
  act(() => {
    vi.setSystemTime(new Date(iso));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useNutritionLog – перехід через північ (data-42)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(BEFORE_MIDNIGHT));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("активний день за замовчуванням пересувається на новий сьогоднішній", () => {
    const { result } = renderHook(() => useNutritionLog(), { wrapper });
    expect(result.current.selectedDate).toBe("2026-10-01");

    wakeAt(AFTER_MIDNIGHT);

    expect(result.current.selectedDate).toBe("2026-10-02");
  });

  it("нова страва після півночі лягає в новий день, а не у вчорашній", () => {
    const { result } = renderHook(() => useNutritionLog(), { wrapper });

    wakeAt(AFTER_MIDNIGHT);
    act(() => {
      result.current.handleAddMeal({ name: "Сніданок", mealType: "breakfast" });
    });

    expect(result.current.nutritionLog["2026-10-02"]?.meals).toHaveLength(1);
    expect(result.current.nutritionLog["2026-10-01"]).toBeUndefined();
  });

  it("страва пишеться в новий день навіть без перерендеру на межі доби", () => {
    const { result } = renderHook(() => useNutritionLog(), { wrapper });

    // Годинник перескочив, а таймер/visibilitychange ще не спрацювали.
    vi.setSystemTime(new Date(AFTER_MIDNIGHT));
    act(() => {
      result.current.handleAddMeal({ name: "Сніданок", mealType: "breakfast" });
    });

    expect(result.current.nutritionLog["2026-10-02"]?.meals).toHaveLength(1);
    expect(result.current.nutritionLog["2026-10-01"]).toBeUndefined();
  });

  it("явно обраний минулий день лишається після півночі", () => {
    const { result } = renderHook(() => useNutritionLog(), { wrapper });

    act(() => {
      result.current.setSelectedDate("2026-09-28");
    });
    wakeAt(AFTER_MIDNIGHT);

    expect(result.current.selectedDate).toBe("2026-09-28");

    act(() => {
      result.current.handleAddMeal({ name: "Вечеря", mealType: "dinner" });
    });
    expect(result.current.nutritionLog["2026-09-28"]?.meals).toHaveLength(1);
    expect(result.current.nutritionLog["2026-10-02"]).toBeUndefined();
  });

  it("функціональний апдейтер (стрілки днів) рахує від активного дня", () => {
    const { result } = renderHook(() => useNutritionLog(), { wrapper });

    wakeAt(AFTER_MIDNIGHT);
    act(() => {
      result.current.setSelectedDate((d) =>
        d === "2026-10-02" ? "2026-10-01" : d,
      );
    });

    expect(result.current.selectedDate).toBe("2026-10-01");
  });
});
