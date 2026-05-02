import type {
  FoodSearchProduct as SharedFoodSearchProduct,
  FoodSearchResponse as SharedFoodSearchResponse,
} from "@sergeant/shared/schemas";
import type { HttpClient } from "../httpClient";

// Response shapes come from `@sergeant/shared/schemas` (AGENTS.md Hard
// Rule #3 — single source of truth for API contracts). The server handler
// in `apps/server/src/modules/nutrition/food-search.ts` validates its
// outgoing payload against the same schema, so drift between these types
// and what the server actually sends becomes a test-time failure instead
// of a silent production bug.
//
// Historical: the old hand-authored `FoodSearchProduct` interface said
// `{ id?; name?; brand?; [k: string]: unknown }`, which was never true —
// the server always fills `id`, `name`, `source`, `per100`, `defaultGrams`;
// `brand` is `string | null`, never `undefined`. Consumers guarded against
// a shape that never existed.

export type FoodSearchProduct = SharedFoodSearchProduct;
export type FoodSearchResponse = SharedFoodSearchResponse;

export interface FoodSearchEndpoints {
  search: (
    query: string,
    opts?: { signal?: AbortSignal },
  ) => Promise<FoodSearchResponse>;
}

export function createFoodSearchEndpoints(
  http: HttpClient,
): FoodSearchEndpoints {
  return {
    search: (query, opts) =>
      http.get<FoodSearchResponse>("/api/food-search", {
        query: { q: query },
        signal: opts?.signal,
      }),
  };
}
