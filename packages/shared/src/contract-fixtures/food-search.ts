/**
 * Canonical fixtures for `GET /api/food-search?q=…`.
 *
 * The route lives in `apps/server/src/routes/food-search.ts`, handled by
 * `apps/server/src/modules/nutrition/food-search.ts`. Both sides derive
 * their types from `FoodSearchProductSchema` / `FoodSearchResponseSchema`
 * in `../schemas/nutrition`, so the fixtures below are regression-protection
 * for AGENTS.md Hard Rule #3 (server response shape ↔ api-client types ↔ test).
 *
 * Named cases:
 *
 * - `offSingleHit` — one Open Food Facts hit with full macros.
 * - `usdaSingleHit` — one USDA Foundation hit with full macros (zeros not nulls —
 *   the server always backfills with `0` when upstream has no data, per schema
 *   comment at `packages/shared/src/schemas/nutrition.ts:79`).
 * - `multiSource` — two hits from different sources; exercises dedup / ordering.
 * - `emptyResults` — upstream returned nothing; `{ products: [] }` is valid 200.
 * - `error504` — upstream timeout `{ error }` envelope.
 *
 * Closes contract slice PR-T30 from
 * `docs/testing/2026-05-05-tests-pr-plan.md` (web `/api/food-search`
 * consumer contract).
 */

import {
  FoodSearchErrorSchema,
  FoodSearchSuccessSchema,
  type FoodSearchError,
  type FoodSearchSuccess,
} from "../schemas/nutrition";

/** 200 fixtures — `{ products: FoodSearchProduct[] }` envelope. */
export const foodSearchSuccessFixtures = {
  offSingleHit: {
    products: [
      {
        id: "off_1a2b3c4d",
        name: "Молоко 2.5% Яготинське",
        brand: "Яготинське",
        source: "off",
        per100: { kcal: 52, protein_g: 2.8, fat_g: 2.5, carbs_g: 4.7 },
        defaultGrams: 200,
      },
    ],
  },
  usdaSingleHit: {
    products: [
      {
        id: "usda_0f1e2d3c",
        name: "Milk, whole, 3.25% milkfat",
        brand: null,
        source: "usda",
        per100: { kcal: 61, protein_g: 3.15, fat_g: 3.25, carbs_g: 4.78 },
        defaultGrams: 200,
      },
    ],
  },
  multiSource: {
    products: [
      {
        id: "off_a1b2c3d4",
        name: "Kefir 1%",
        brand: "Молокія",
        source: "off",
        per100: { kcal: 40, protein_g: 3.2, fat_g: 1.0, carbs_g: 3.8 },
        defaultGrams: 200,
      },
      {
        id: "usda_d4c3b2a1",
        name: "Kefir, lowfat, plain",
        brand: null,
        source: "usda",
        per100: { kcal: 41, protein_g: 3.5, fat_g: 1.0, carbs_g: 4.7 },
        defaultGrams: 200,
      },
    ],
  },
  emptyResults: {
    products: [],
  },
} as const satisfies Record<string, FoodSearchSuccess>;

export type FoodSearchSuccessFixtureCase =
  keyof typeof foodSearchSuccessFixtures;

/** Non-200 fixtures — `{ error }` envelope. */
export const foodSearchErrorFixtures = {
  upstreamTimeout: {
    error: "Сервіс недоступний (таймаут). Спробуй пізніше.",
  },
  serverError: {
    error: "Server error",
  },
} as const satisfies Record<string, FoodSearchError>;

export type FoodSearchErrorFixtureCase = keyof typeof foodSearchErrorFixtures;

/**
 * Same fixtures, but typed as `unknown` — feed these to the schema
 * `safeParse()` path to exercise the runtime parser. The
 * `as const satisfies …` shape above already proves the static types
 * are valid; the `unknown` view proves the schema accepts the JSON.
 */
export const foodSearchSuccessRawFixtures: Record<
  FoodSearchSuccessFixtureCase,
  unknown
> = foodSearchSuccessFixtures;

export const foodSearchErrorRawFixtures: Record<
  FoodSearchErrorFixtureCase,
  unknown
> = foodSearchErrorFixtures;

/**
 * Cheap self-check: every named fixture must parse through its schema.
 * Mirrors `assertBarcodeFixturesValid()` so consumer and producer test
 * suites can both call this before relying on the wire shape.
 */
export function assertFoodSearchFixturesValid(): void {
  for (const [name, fixture] of Object.entries(foodSearchSuccessFixtures)) {
    const result = FoodSearchSuccessSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "food-search.success.${name}" no longer matches FoodSearchSuccessSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(foodSearchErrorFixtures)) {
    const result = FoodSearchErrorSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "food-search.error.${name}" no longer matches FoodSearchErrorSchema: ${result.error.message}`,
      );
    }
  }
}
