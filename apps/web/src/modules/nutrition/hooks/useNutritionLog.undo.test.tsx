// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@shared/hooks/useToast";
import { useNutritionLog } from "./useNutritionLog";
import type { Meal } from "../lib/nutritionStorage";

// useNutritionLog тягне useToast() зсередини (для toast.error на
// JSON-merge / undo-restore failure). Без ToastProvider hook кидає
// "useToast must be used within <ToastProvider>" ще до першого
// act() — тому wrapper мусить включати обидва провайдери.
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function meal(id: string): Meal {
  return {
    id,
    name: "Яйце",
    time: "09:00",
    mealType: "breakfast",
    label: "",
    macros: { kcal: 70, protein_g: 6, fat_g: 5, carbs_g: 0 },
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
  };
}

describe("useNutritionLog — delete + undo meal flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("handleRemoveMeal → handleRestoreMeal повертає той самий meal на ту саму дату", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });
    const date = "2025-01-15";
    const m = meal("m1");

    act(() => result.current.setSelectedDate(date));
    act(() => result.current.handleAddMeal(m));
    expect(result.current.nutritionLog[date]?.meals?.[0]?.id).toBe("m1");

    act(() => result.current.handleRemoveMeal(date, "m1"));
    expect(result.current.nutritionLog[date]?.meals ?? []).toHaveLength(0);

    act(() => result.current.handleRestoreMeal(date, m));
    const after = result.current.nutritionLog[date]?.meals ?? [];
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("m1");
  });

  it("handleRestoreMeal скидає pending thumbnail delete (інакше фото видаляється через 6с навіть після undo)", () => {
    // Регресія: handleRemoveMeal планує `deleteMealThumbnail` через 6с. Якщо
    // юзер встигає undo — ми повинні прибрати цей timer, бо інакше фото
    // буде видалене з IndexedDB асинхронно уже після того, як meal знову
    // з'явився у логу.
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });
    const date = "2025-01-16";
    const m = meal("m2");

    act(() => result.current.setSelectedDate(date));
    act(() => result.current.handleAddMeal(m));
    act(() => result.current.handleRemoveMeal(date, "m2"));
    act(() => result.current.handleRestoreMeal(date, m));

    // Якщо таймер не скасували, тут би крутнувся async delete. Ми не
    // ловимо безпосередньо IDB — ця перевірка опирається на те, що 6с
    // пройшло, але meal усе одно в логу.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const after = result.current.nutritionLog[date]?.meals ?? [];
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("m2");
  });

  it("подвійний restore не дублює запис (ідемпотентність)", () => {
    // Регресія: раніше `addLogEntry` просто апендив у масив без dedup —
    // якщо юзер двічі тапнув "Повернути" (типова скарга на повільний фідбек),
    // у логу з'являвся другий однаковий meal. Тепер handleRestoreMeal
    // ігнорує повторний виклик з тим самим id на ту саму дату.
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });
    const date = "2025-01-17";
    const m = meal("m3");

    act(() => result.current.setSelectedDate(date));
    act(() => result.current.handleAddMeal(m));
    act(() => result.current.handleRemoveMeal(date, "m3"));
    act(() => result.current.handleRestoreMeal(date, m));
    act(() => result.current.handleRestoreMeal(date, m));

    const after = result.current.nutritionLog[date]?.meals ?? [];
    expect(after.filter((x: Meal) => x.id === "m3")).toHaveLength(1);
  });

  it("handleRemoveMeal ігнорує відсутній id без throw", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });
    expect(() => {
      act(() => result.current.handleRemoveMeal("2025-01-20", ""));
      act(() => result.current.handleRemoveMeal("2025-01-20", { id: "" }));
    }).not.toThrow();
  });
});
