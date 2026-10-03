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
 * A single normalised product row returned by any of the FOUR barcode
 * upstreams (Open Food Facts / USDA Branded Foods / UPCitemdb / Silpo MCP —
 * `"silpo"` added per `docs/work/specs/silpo-mcp-integration.md`
 * § "Продуктові дані — четверте джерело каскаду"; Silpo only ever appears
 * for the requesting user's own linked account, never as a shared/service
 * source — see `apps/server/src/modules/silpo/foodSource.ts`). Every
 * non-enum field is explicitly nullable — normalisers must not leave
 * `undefined` lurking (consumers rely on `null` as the "absent" sentinel).
 */
/**
 * Нутрієнти понад КБЖВ, які джерело повідомило на 100 г.
 *
 * ЧОМУ ОКРЕМИЙ ОБʼЄКТ, А НЕ ПʼЯТЬ ПОЛІВ ПОРУЧ ІЗ `kcal_100g`. Тут потрібні
 * ДВА різні «немає», і плоскими полями їх не розрізнити:
 *
 *   `nutrients` відсутній  — джерело таких даних не віддає ВЗАГАЛІ
 *                            (UPCitemdb, Сільпо, USDA-гілка каскаду).
 *   поле всередині `null`  — джерело віддає нутрієнти, але для ЦЬОГО
 *                            продукту значення немає.
 *
 * Різниця не косметична: «не питали» і «спитали, немає» по-різному
 * читаються в картці продукту (у першому випадку показувати нема чого, у
 * другому чесно стоїть прочерк) і по-різному поводяться при перезапису
 * рядка каталогу іншим джерелом.
 *
 * `alcohol_100g` тут НЕ для показу. Він потрібен воротам Атвотера
 * (`atwater_delta_kcal`, міграція 123): етанол калорійний, але не є ні
 * білком, ні жиром, ні вуглеводом, тож без цього доданка формула оголошує
 * битим КОЖЕН алкогольний напій. Див. AI-DANGER у `productCatalog.ts`.
 *
 * `salt_100g`, а не натрій: саме сіль друкують на етикетці в ЄС і Україні,
 * і саме її віддає OFF. Натрій = сіль ÷ 2.5, якщо колись знадобиться.
 */
export const ProductNutrientsSchema = z.object({
  fiber_100g: z.number().nullable(),
  sugars_100g: z.number().nullable(),
  saturatedFat_100g: z.number().nullable(),
  salt_100g: z.number().nullable(),
  alcohol_100g: z.number().nullable(),
});
export type ProductNutrients = z.infer<typeof ProductNutrientsSchema>;

export const BarcodeProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable(),
  kcal_100g: z.number().nullable(),
  protein_100g: z.number().nullable(),
  fat_100g: z.number().nullable(),
  carbs_100g: z.number().nullable(),
  servingSize: z.string().nullable(),
  servingGrams: z.number().nullable(),
  source: z.enum(["off", "usda", "upcitemdb", "silpo"]),
  // `partial` is only set by UPCitemdb today (macros missing, serving
  // present); keep optional (not nullable) to avoid forcing other sources
  // to emit it explicitly.
  partial: z.boolean().optional(),
  // Optional за тією ж логікою, що й `partial`: джерело, яке нутрієнтів не
  // віддає, не мусить писати пʼять `null`-ів. Пояснення різниці між
  // «ключа немає» і «значення null» — у докстрінгу `ProductNutrientsSchema`.
  nutrients: ProductNutrientsSchema.optional(),
  /**
   * Фото продукту (U1, рішення власника 2026-09-11: джерело — Open Food
   * Facts за штрихкодом, вільна ліцензія; Unsplash не підключаємо).
   *
   * `nullable`, а не `optional`: на відміну від нутрієнтів, тут «немає
   * фото» — один стан, а не два. Ніякої різниці між «джерело картинок не
   * має» і «має, але для цього товару немає» споживач не робить: у обох
   * випадках картка малює іконку категорії.
   *
   * Абсолютний URL на хост OFF. CSP його вже пропускає — `img-src` має
   * `https:` (див. `apps/web/index.html`), тож окремого алловліста не
   * потрібно. Додасться суворіший `img-src` — цей шлях доведеться туди
   * внести явно, інакше фото мовчки перестане вантажитись.
   */
  imageUrl: z.string().nullable().optional(),
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
  // `"silpo"` — fourth source, connected-user-only (see
  // `apps/server/src/modules/silpo/foodSource.ts`). A Silpo hit without any
  // macro data is dropped upstream rather than emitted here with fake zeros
  // (this schema, unlike `BarcodeProductSchema`, has no `partial` escape
  // hatch — `per100` is always meant to be real).
  source: z.enum(["off", "usda", "silpo"]),
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
