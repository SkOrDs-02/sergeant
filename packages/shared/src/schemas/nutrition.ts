import { z } from "zod";

/**
 * Response schemas for `apps/server/src/modules/nutrition/*`.
 *
 * SSOT pattern for AGENTS.md Hard Rule #3 — "API contract: server response
 * shape ↔ api-client types ↔ test". Previously, the server handler
 * declared a local `interface NormalizedProduct`, and `@sergeant/api-client`
 * declared a separate `interface BarcodeProduct` by copy-paste. The two
 * drifted (optional vs nullable fields, missing `source` / `servingSize`
 * on the client). These schemas are the single source of truth; both
 * sides now derive their types via `z.infer<>`.
 *
 * Pattern:
 *   - Server handler imports the schema and calls `Schema.parse(payload)`
 *     immediately before `res.json(payload)`. Shape mismatch throws at
 *     runtime in tests, not silently in production.
 *   - `@sergeant/api-client` re-exports `z.infer<typeof Schema>` instead of
 *     hand-authoring a mirror interface.
 *   - Any new response field moves through this file first, then both
 *     ends compile-error until they use the new field.
 */

/**
 * A single normalised product row returned by any of the three barcode
 * upstreams (Open Food Facts / USDA Branded Foods / UPCitemdb). Every
 * non-enum field is explicitly nullable — normalisers must not leave
 * `undefined` lurking (consumers rely on `null` as the "absent" sentinel).
 */
export const BarcodeProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable(),
  kcal_100g: z.number().nullable(),
  protein_100g: z.number().nullable(),
  fat_100g: z.number().nullable(),
  carbs_100g: z.number().nullable(),
  servingSize: z.string().nullable(),
  servingGrams: z.number().nullable(),
  source: z.enum(["off", "usda", "upcitemdb"]),
  // `partial` is only set by UPCitemdb today (macros missing, serving
  // present); keep optional (not nullable) to avoid forcing other sources
  // to emit it explicitly.
  partial: z.boolean().optional(),
});
export type BarcodeProduct = z.infer<typeof BarcodeProductSchema>;

/** Success envelope for `GET /api/barcode?barcode=…` (HTTP 200). */
export const BarcodeLookupSuccessSchema = z.object({
  product: BarcodeProductSchema,
});
export type BarcodeLookupSuccess = z.infer<typeof BarcodeLookupSuccessSchema>;

/** Error envelope for `/api/barcode` (HTTP 400 / 404 / 500 / 504). */
export const BarcodeLookupErrorSchema = z.object({
  error: z.string().min(1),
});
export type BarcodeLookupError = z.infer<typeof BarcodeLookupErrorSchema>;

/**
 * Discriminated response — what the client actually observes across all
 * status codes. Either `{ product }` on 200 or `{ error }` otherwise.
 * `product` is optional at the type level (so the 404 branch is a valid
 * value), matching the existing `BarcodeLookupResponse` semantics.
 */
export const BarcodeLookupResponseSchema = z.union([
  BarcodeLookupSuccessSchema,
  BarcodeLookupErrorSchema,
]);
export type BarcodeLookupResponse = z.infer<typeof BarcodeLookupResponseSchema>;

// ── Food search (`GET /api/food-search?q=…`) ────────────────────────────────

/**
 * Per-100 g macros block. Numeric-only: server always fills with zeros when
 * upstream has no data, so `null` is not a valid value here (drops the
 * ambiguity vs. "macros-weighted picker" that the client otherwise has to
 * special-case).
 */
export const FoodSearchMacrosSchema = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
});
export type FoodSearchMacros = z.infer<typeof FoodSearchMacrosSchema>;

/**
 * One search hit normalised out of OFF or USDA. The server's internal
 * `NormalizedSearchProduct` in
 * `apps/server/src/modules/nutrition/food-search.ts` is this schema's
 * inferred type — the two must not drift.
 *
 * Historical note: the api-client previously declared
 * `FoodSearchProduct` as `{ id?; name?; brand?; [k:string]: unknown }`.
 * That's a lie — the server always returns `id` / `name` / `source` /
 * `per100` / `defaultGrams`, and `brand` is `string | null` (never
 * `undefined`). Consumers like `useFoodSearch` and `FoodPickerSection`
 * wrote `p.name ?? fallback` against an impossible `undefined`. The schema
 * makes the actual contract honest.
 */
export const FoodSearchProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  source: z.enum(["off", "usda"]),
  per100: FoodSearchMacrosSchema,
  defaultGrams: z.number(),
});
export type FoodSearchProduct = z.infer<typeof FoodSearchProductSchema>;

/** Success envelope for `GET /api/food-search?q=…`. Shape is `{ products }`. */
export const FoodSearchSuccessSchema = z.object({
  products: z.array(FoodSearchProductSchema),
});
export type FoodSearchSuccess = z.infer<typeof FoodSearchSuccessSchema>;

/** Error envelope (`504` on upstream timeout, `500` on unexpected). */
export const FoodSearchErrorSchema = z.object({
  error: z.string().min(1),
});
export type FoodSearchError = z.infer<typeof FoodSearchErrorSchema>;

/**
 * What the api-client sees across all statuses. Same discriminated-union
 * shape as `BarcodeLookupResponseSchema`; unions a `{ products }` success
 * and a `{ error }` failure.
 */
export const FoodSearchResponseSchema = z.union([
  FoodSearchSuccessSchema,
  FoodSearchErrorSchema,
]);
export type FoodSearchResponse = z.infer<typeof FoodSearchResponseSchema>;
