/**
 * Canonical fixtures for `GET /api/barcode?barcode=…` / `GET /api/v1/barcode`.
 *
 * The route lives in `apps/server/src/modules/nutrition/barcode.ts` and is
 * consumed by `packages/api-client/src/endpoints/barcode.ts`. Both sides
 * derive their types from `BarcodeProductSchema` /
 * `BarcodeLookupSuccessSchema` / `BarcodeLookupErrorSchema` in
 * `../schemas/nutrition`, so the fixtures below double as
 * regression-protection for AGENTS.md Hard Rule #3 (server response shape
 * ↔ api-client types ↔ test).
 *
 * Each named case represents a real wire shape the producer might emit:
 *
 * - `offFull` — Open Food Facts hit with full macros and serving info.
 * - `usdaBranded` — USDA Branded Foods hit; `partial` is **not** emitted
 *   because USDA always backfills macros (`partial` is upcitemdb-only).
 * - `upcitemdbPartial` — UPCitemdb hit where macros are missing but the
 *   serving size is present; `partial: true` flags the consumer that the
 *   row is not safe for macro arithmetic without a follow-up lookup.
 * - `nullableMacros` — OFF hit with brand/macros/serving missing; every
 *   nullable field is exercised so the schema's `null`-vs-`undefined`
 *   contract is locked down (see schema comment at
 *   `packages/shared/src/schemas/nutrition.ts:27`).
 * - `error404` — error envelope (`{ error }`) used for 404/400/500/504.
 *
 * Closes contract slice PR-T29 from
 * `docs/testing/2026-05-05-tests-pr-plan.md` (web `/api/barcode`
 * consumer contract).
 */

import {
  BarcodeLookupErrorSchema,
  BarcodeLookupSuccessSchema,
  type BarcodeLookupError,
  type BarcodeLookupSuccess,
} from "../schemas/nutrition";

/** 200 fixtures — `{ product }` envelope, four representative shapes. */
export const barcodeSuccessFixtures = {
  offFull: {
    product: {
      name: "Молоко 2.5%",
      brand: "Простоквашино",
      kcal_100g: 52,
      protein_100g: 2.8,
      fat_100g: 2.5,
      carbs_100g: 4.7,
      servingSize: "200 ml",
      servingGrams: 200,
      source: "off",
    },
  },
  usdaBranded: {
    product: {
      name: "Greek Yogurt, Plain, Nonfat",
      brand: "Chobani",
      kcal_100g: 59,
      protein_100g: 10,
      fat_100g: 0,
      carbs_100g: 3.6,
      servingSize: "170 g",
      servingGrams: 170,
      source: "usda",
    },
  },
  upcitemdbPartial: {
    product: {
      name: "Mystery Snack Bar",
      brand: null,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingSize: "45 g",
      servingGrams: 45,
      source: "upcitemdb",
      partial: true,
    },
  },
  nullableMacros: {
    product: {
      name: "Unbranded apple",
      brand: null,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingSize: null,
      servingGrams: null,
      source: "off",
    },
  },
} as const satisfies Record<string, BarcodeLookupSuccess>;

export type BarcodeSuccessFixtureCase = keyof typeof barcodeSuccessFixtures;

/** Non-200 fixtures — `{ error }` envelope. */
export const barcodeErrorFixtures = {
  notFound: { error: "barcode not found" },
  badRequest: { error: "barcode must be 8-14 digits" },
  upstreamTimeout: { error: "upstream timeout" },
} as const satisfies Record<string, BarcodeLookupError>;

export type BarcodeErrorFixtureCase = keyof typeof barcodeErrorFixtures;

/**
 * Same fixtures, but typed as `unknown` — feed these to the schema
 * `safeParse()` path to exercise the runtime parser. The
 * `as const satisfies …` shape above already proves the static types
 * are valid; the `unknown` view proves the schema accepts the JSON.
 */
export const barcodeSuccessRawFixtures: Record<
  BarcodeSuccessFixtureCase,
  unknown
> = barcodeSuccessFixtures;

export const barcodeErrorRawFixtures: Record<BarcodeErrorFixtureCase, unknown> =
  barcodeErrorFixtures;

/**
 * Cheap self-check: every named fixture must parse through its schema.
 * Mirrors `assertMeFixturesValid()` so consumer and producer test suites
 * can both call this before relying on the wire shape.
 */
export function assertBarcodeFixturesValid(): void {
  for (const [name, fixture] of Object.entries(barcodeSuccessFixtures)) {
    const result = BarcodeLookupSuccessSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "barcode.success.${name}" no longer matches BarcodeLookupSuccessSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(barcodeErrorFixtures)) {
    const result = BarcodeLookupErrorSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "barcode.error.${name}" no longer matches BarcodeLookupErrorSchema: ${result.error.message}`,
      );
    }
  }
}
