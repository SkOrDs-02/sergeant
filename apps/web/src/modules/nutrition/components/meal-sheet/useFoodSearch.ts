/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@shared/hooks";
import { foodSearchApi } from "@shared/api";
import type { FoodSearchProduct } from "@shared/api";
import { nutritionKeys } from "@shared/lib/api/queryKeys";
import { searchFoods } from "../../lib/foodDb/foodDb";
import type { FoodProduct } from "../../lib/foodDb/foodDb";

const LOCAL_DEBOUNCE_MS = 180;
const OFF_DEBOUNCE_MS = 600;
const OFF_MIN_LEN = 2;

/** Стиль: помилка закінчується підказкою про дію (style-guide §3). */
const OFF_SEARCH_FAILED =
  "Пошук по базі продуктів не відповів. Спробуй ще раз або введи КБЖВ вручну.";

// react-query is a useful fit here: repeated searches for the same query
// return from cache instantly (important for UX when users backspace and
// retype), requests for stale queries are auto-cancelled via `signal`, and
// the built-in retry policy from the shared QueryClient handles flaky
// mobile networks without the component having to know.
//
// Помилки від `foodSearchApi` — це вже `ApiError` з коректним `.status`,
// так що `isRetriableError` у `queryClient` сам вирішить, чи варто ретраїти.
// Раніше тут була конверсія у plain `Error` — лишали лише `.status` і
// втрачали `kind`/`serverMessage`/`isOffline`. React Query таке не любить.
async function fetchOpenFoodFacts(
  query: string,
  signal?: AbortSignal,
): Promise<FoodSearchProduct[]> {
  const data = await foodSearchApi.search(query, {
    ...(signal !== undefined ? { signal } : {}),
  });
  // `FoodSearchResponse` is a discriminated union `{ products } | { error }`;
  // narrow via property presence before indexing.
  return "products" in data && Array.isArray(data.products)
    ? data.products
    : [];
}

export interface UseFoodSearchResult {
  foodHits: FoodProduct[];
  offHits: FoodSearchProduct[];
  foodBusy: boolean;
  offBusy: boolean;
  /**
   * Обидва джерела відпрацювали САМЕ поточний запит: debounce догнав, і
   * жоден запит не в польоті.
   *
   * Порожній `foodHits` сам собою не означає «нічого не знайдено» — рівно
   * так само він виглядає в перші 600 мс, поки зовнішній debounce ще не
   * догнав набране. Тому автоматичний вибір результату (позиція з чека
   * Сільпо) чекає на цей прапорець: без нього він вирішував би «промах»
   * ще до того, як пошук почався.
   */
  searchSettled: boolean;
  foodErr: string;
  setFoodErr: Dispatch<SetStateAction<string>>;
}

export function useFoodSearch(foodQuery: string): UseFoodSearchResult {
  const trimmed = foodQuery.trim();
  // Debounce user input separately from the queries themselves. We don't want
  // react-query to see every keystroke — otherwise it would spin up (and
  // cancel) one request per character.
  const localQuery = useDebounce(trimmed, LOCAL_DEBOUNCE_MS);
  const offQuery = useDebounce(trimmed, OFF_DEBOUNCE_MS);

  const local = useQuery<FoodProduct[]>({
    queryKey: nutritionKeys.foodSearchLocal(localQuery),
    queryFn: () => searchFoods(localQuery, 8),
    enabled: localQuery.length > 0,
    staleTime: 5 * 60_000,
  });

  const off = useQuery<FoodSearchProduct[]>({
    queryKey: nutritionKeys.foodSearchOff(offQuery),
    queryFn: ({ signal }) => fetchOpenFoodFacts(offQuery, signal),
    enabled: offQuery.length >= OFF_MIN_LEN,
    staleTime: 5 * 60_000,
  });

  // `foodErr` is not owned by the search queries — it's used by
  // the picker to report search errors into the shared UI area.
  // Keep it local state here so the public API of this hook stays stable
  // and consumers don't have to track where it lives.
  const [foodErr, setFoodErr] = useState("");

  const [prevTrimmed, setPrevTrimmed] = useState(trimmed);
  if (trimmed !== prevTrimmed) {
    setPrevTrimmed(trimmed);
    if (foodErr) setFoodErr("");
  }

  // AI-DANGER: помилку запиту до бази продуктів НЕ можна ковтати. До
  // 2026-09-03 `off.error` не читав ніхто: `offHits` просто ставали
  // порожніми, і людина бачила «нічого не знайдено» — відповідь про порожню
  // базу замість відповіді про збій. Найтихіший випадок — завеликий запит:
  // сервер віддавав 400, а екран казав, що такого продукту не існує
  // (browser-QA 2026-09-02). Локальний пошук сюди не входить: `searchFoods`
  // ковтає свої помилки всередині й повертає `[]` за контрактом.
  const searchErr = off.isError ? OFF_SEARCH_FAILED : "";

  return {
    foodHits: trimmed && localQuery === trimmed ? (local.data ?? []) : [],
    offHits: trimmed && offQuery === trimmed ? (off.data ?? []) : [],
    foodBusy: local.isFetching && localQuery.length > 0,
    offBusy: off.isFetching && offQuery.length >= OFF_MIN_LEN,
    searchSettled:
      localQuery === trimmed &&
      offQuery === trimmed &&
      !local.isFetching &&
      !off.isFetching,
    // Ручна помилка (штрихкод, чек) має пріоритет: вона стосується дії,
    // яку людина щойно зробила, а збій пошуку триває фоном.
    foodErr: foodErr || searchErr,
    setFoodErr,
  };
}
