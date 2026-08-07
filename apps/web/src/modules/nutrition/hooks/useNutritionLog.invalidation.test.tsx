// @vitest-environment jsdom
/**
 * Що саме запис їжі має інвалідувати — і що НЕ має.
 *
 * Денна порада коуча коштує ~$0.004 за генерацію і за контрактом
 * (`useCoachInsight`: ключ за днем + `staleTime: Infinity`) не змінюється
 * протягом доби. Інвалідація на кожну страву ламала обидві властивості
 * одразу, і зловити це можна було лише живим кліком: тесту на цей ефект не
 * існувало взагалі.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNutritionLog } from "./useNutritionLog";
import { clearNutritionSqliteCache } from "../lib/sqliteReader";
import { ToastProvider } from "@shared/hooks/useToast";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ToastProvider>
  );
  const { result } = renderHook(() => useNutritionLog(), { wrapper });
  // Перший прохід ефекту пропущений (`didMountRef`) — рахуємо лише те, що
  // спричинила сама страва.
  invalidate.mockClear();
  return { result, invalidate };
}

/**
 * Усі ключі, передані в `invalidateQueries`, як плоский список.
 *
 * Структурний тип замість `ReturnType<typeof vi.spyOn>`: перевантаження
 * `spyOn` віддають `calls` як `any[][]`, і `noUncheckedIndexedAccess`
 * ловить кожен елемент як implicit `any`.
 */
function invalidatedKeys(invalidate: {
  mock: { calls: unknown[][] };
}): readonly unknown[][] {
  return invalidate.mock.calls
    .map((call) => (call[0] as { queryKey?: unknown[] } | undefined)?.queryKey)
    .filter((k): k is unknown[] => Array.isArray(k));
}

describe("useNutritionLog — інвалідації при записі страви", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.restoreAllMocks();
  });

  it("не інвалідує пораду коуча — вона денна, а не по-страві", async () => {
    const { result, invalidate } = setup();

    act(() => {
      result.current.handleAddMeal({
        name: "Вівсянка",
        mealType: "breakfast",
        macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
      });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(invalidatedKeys(invalidate).some((key) => key[0] === "coach")).toBe(
      false,
    );
  });

  it("інвалідує історію дайджесту — її користувач може гортати просто зараз", async () => {
    const { result, invalidate } = setup();

    act(() => {
      result.current.handleAddMeal({
        name: "Суп",
        mealType: "lunch",
        macros: { kcal: 250, protein_g: 12, fat_g: 8, carbs_g: 20 },
      });
    });

    await waitFor(() =>
      expect(
        invalidatedKeys(invalidate).some(
          (key) => key[0] === "weekly-digest" && key[1] === "history",
        ),
      ).toBe(true),
    );
  });
});
