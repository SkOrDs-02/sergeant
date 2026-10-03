// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@shared/hooks/useToast";
import { useNutritionLog } from "./useNutritionLog";
import { clearNutritionSqliteCache } from "../lib/sqliteReader";
import { useQuickAddMealFromChip } from "./useQuickAddMealFromChip";
import type { QuickChip } from "./useNutritionQuickChips";

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

  // Ноутбук проспав ніч: годинник уже в новому дні, а таймер і
  // `visibilitychange` не спрацювали — екран ще показує вчора. Запис лягає в
  // сьогодні, тож екран і «Скасувати» мусять піти за ним, а не за відсталим
  // `selectedDate` з рендеру, у якому викликач запам'ятав день.
  describe("відстала шапка (годинник перескочив без події)", () => {
    it("після додавання екран перевертається на день запису", () => {
      const { result } = renderHook(() => useNutritionLog(), { wrapper });
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));
      expect(result.current.selectedDate).toBe("2026-10-01");

      act(() => {
        result.current.handleAddMeal({
          name: "Сніданок",
          mealType: "breakfast",
        });
      });

      expect(result.current.nutritionLog["2026-10-02"]?.meals).toHaveLength(1);
      expect(result.current.selectedDate).toBe("2026-10-02");
    });

    it("handleAddMeal повертає день запису, і undo через нього знімає страву", () => {
      const { result } = renderHook(() => useNutritionLog(), { wrapper });
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));

      const staleDay = result.current.selectedDate;
      let wroteTo = "";
      act(() => {
        wroteTo = result.current.handleAddMeal({
          id: "m1",
          name: "Сніданок",
          mealType: "breakfast",
        });
      });

      expect(staleDay).toBe("2026-10-01");
      expect(wroteTo).toBe("2026-10-02");
      act(() => {
        result.current.handleRemoveMeal(wroteTo, "m1");
      });
      expect(result.current.nutritionLog["2026-10-02"]?.meals ?? []).toEqual(
        [],
      );
    });

    it("явно обраний день: handleAddMeal повертає саме його", () => {
      const { result } = renderHook(() => useNutritionLog(), { wrapper });
      act(() => {
        result.current.setSelectedDate("2026-09-28");
      });
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));
      let wroteTo = "";
      act(() => {
        wroteTo = result.current.handleAddMeal({ name: "Вечеря" });
      });
      expect(wroteTo).toBe("2026-09-28");
      expect(result.current.selectedDate).toBe("2026-09-28");
    });

    it("duplicateYesterday копіює в сьогодні і перевертає екран разом із записом", () => {
      const { result } = renderHook(() => useNutritionLog(), { wrapper });
      act(() => {
        result.current.handleAddMeal({ id: "y1", name: "Вчорашня" });
      });
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));
      expect(result.current.selectedDate).toBe("2026-10-01");

      act(() => {
        result.current.duplicateYesterday();
      });

      expect(result.current.nutritionLog["2026-10-02"]?.meals).toHaveLength(1);
      expect(result.current.selectedDate).toBe("2026-10-02");
    });

    it("quick-chip: «Скасувати» видаляє з дня, куди страва реально лягла", () => {
      const undo: Array<() => void> = [];
      const toast = {
        success: vi.fn(
          (_m: string, _d?: number, a?: { onClick: () => void }) => {
            if (a) undo.push(a.onClick);
          },
        ),
      };
      const { result } = renderHook(
        () => {
          const log = useNutritionLog();
          const addFromChip = useQuickAddMealFromChip({
            log,
            toast: toast as never,
          });
          return { log, addFromChip };
        },
        { wrapper },
      );
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));
      const chip = {
        label: "Яблуко",
        grams: 100,
        macros: { kcal: 52, protein_g: 0, fat_g: 0, carbs_g: 14 },
      } as unknown as QuickChip;

      act(() => {
        result.current.addFromChip(chip);
      });
      expect(result.current.log.nutritionLog["2026-10-02"]?.meals).toHaveLength(
        1,
      );

      act(() => {
        undo[0]?.();
      });
      expect(
        result.current.log.nutritionLog["2026-10-02"]?.meals ?? [],
      ).toEqual([]);
    });
  });
});
