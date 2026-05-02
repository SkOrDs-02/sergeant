import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { foodSearchApi } from "@shared/api";
import type { FoodSearchProduct } from "@shared/api";
import { nutritionKeys } from "@shared/lib/queryKeys";
import { searchFoods } from "../../lib/foodDb/foodDb";
import type { FoodProduct } from "../../lib/foodDb/foodDb";

const LOCAL_DEBOUNCE_MS = 180;
const OFF_DEBOUNCE_MS = 600;
const OFF_MIN_LEN = 2;

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
  const data = await foodSearchApi.search(query, { signal });
  // `FoodSearchResponse` is a discriminated union `{ products } | { error }`;
  // narrow via property presence before indexing.
  return "products" in data && Array.isArray(data.products)
    ? data.products
    : [];
}

// Debounce user input separately from the queries themselves. We don't want
// react-query to see every keystroke — otherwise it would spin up (and
// cancel) one request per character.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export interface UseFoodSearchResult {
  foodHits: FoodProduct[];
  offHits: FoodSearchProduct[];
  foodBusy: boolean;
  offBusy: boolean;
  foodErr: string;
  setFoodErr: Dispatch<SetStateAction<string>>;
}

export function useFoodSearch(foodQuery: string): UseFoodSearchResult {
  const trimmed = foodQuery.trim();
  const localQuery = useDebouncedValue(trimmed, LOCAL_DEBOUNCE_MS);
  const offQuery = useDebouncedValue(trimmed, OFF_DEBOUNCE_MS);

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
  // `SaveAsFood` to report "save food" errors into the shared UI area.
  // Keep it local state here so the public API of this hook stays stable
  // and consumers don't have to track where it lives.
  const [foodErr, setFoodErr] = useState("");

  // Any pending save-food error is stale the moment the user starts typing
  // a new search. The pre-react-query implementation did this implicitly on
  // the fetch-effect; restore it explicitly here.
  useEffect(() => {
    if (foodErr) setFoodErr("");
    // `foodErr` excluded: including it would loop (effect clears it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  return {
    foodHits: trimmed && localQuery === trimmed ? (local.data ?? []) : [],
    offHits: trimmed && offQuery === trimmed ? (off.data ?? []) : [],
    foodBusy: local.isFetching && localQuery.length > 0,
    offBusy: off.isFetching && offQuery.length >= OFF_MIN_LEN,
    foodErr,
    setFoodErr,
  };
}
