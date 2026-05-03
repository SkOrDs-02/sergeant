import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, isApiError } from "@shared/api";
import { barcodeApi, type BarcodeProduct } from "@shared/api";
import { nutritionKeys } from "@shared/lib/api/queryKeys";

/**
 * Shared React Query–backed barcode lookup.
 *
 * Обидва сценарії сканування (meal-sheet "додати продукт у прийом їжі" і
 * комора "додати продукт у склад") раніше дублювали один і той же HTTP-виклик
 * до `/api/barcode`. Тепер обидва запити ходять крізь спільну cache-лінію
 * `nutritionKeys.barcode(code)` — повторний скан тієї ж банки молока
 * (у комірці або в лотку) не б'є сервер вдруге.
 *
 * Сервер повертає 404 для "невідомого" штрих-коду — це нормальна (а не
 * виняткова) ситуація, тож перехоплюємо 404 і повертаємо `null`. Інші
 * помилки кидаємо як `ApiError`, і викликач сам вирішує, як показати їх
 * користувачу.
 */

// Локальна TTL-політика: штрих-код вказує на конкретний товар, його
// `per100` не змінюється. 24 години свіжості, 7 днів у пам'яті/LRU — достатньо,
// щоб повторні сканування в один день не ходили в мережу взагалі.
const STALE_TIME = 24 * 60 * 60_000;
const GC_TIME = 7 * 24 * 60 * 60_000;

async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await barcodeApi.lookup(code);
    return res?.product ?? null;
  } catch (err) {
    if (isApiError(err) && err.status === 404) return null;
    throw err;
  }
}

/**
 * Повертає імперативну функцію `lookup(code)`, яка:
 *   1. Перевіряє офлайн-стан до кидка запиту (інакше отримаємо
 *      "Failed to fetch" з ApiError, менш читабельно).
 *   2. Делегує `queryClient.fetchQuery` з ключем `nutritionKeys.barcode(code)`.
 *   3. Повертає `BarcodeProduct | null` (null = товар не знайдено в базі).
 */
export function useBarcodeProductLookup() {
  const queryClient = useQueryClient();

  return useCallback(
    async (code: string): Promise<BarcodeProduct | null> => {
      const normalized = String(code).trim();
      if (!normalized) return null;

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new ApiError({
          kind: "network",
          message: "Немає підключення до інтернету. Спробуй пізніше.",
          url: "/api/barcode",
        });
      }

      return queryClient.fetchQuery({
        queryKey: nutritionKeys.barcode(normalized),
        queryFn: () => lookupBarcode(normalized),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
      });
    },
    [queryClient],
  );
}
