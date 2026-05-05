/**
 * Open Food Facts (OFF) response normalizers.
 *
 * Two entry-points:
 * - `normalizeOFFBarcode` — single-product barcode lookup (product page API)
 * - `normalizeOFFSearch`  — multi-product search result
 *
 * Both consume the same raw OFF product shape and apply shared nutriment
 * extraction, differing only in the output contract (barcode returns serving
 * info, search returns an id + per-100 g macros + default grams).
 */

// ── Raw upstream types ───────────────────────────────────────────────────────

export interface OFFProduct {
  product_name?: string;
  product_name_uk?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_size?: string;
  serving_quantity?: number | string;
}

export interface OFFSearchProduct {
  code?: string;
  product_name?: string;
  product_name_uk?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_quantity?: number | string;
}

// ── Normalized output types ──────────────────────────────────────────────────

export interface NormalizedOFFBarcode {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingSize: string | null;
  servingGrams: number | null;
  source: "off";
}

export interface NormalizedOFFSearch {
  id: string;
  name: string;
  brand: string | null;
  source: "off";
  per100: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  defaultGrams: number;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function round1(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function firstBrand(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return String!(raw).split(",")[0]!.trim() || null;
}

interface ExtractedMacros {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

function extractNutriments(
  nutriments: Record<string, unknown> | undefined | null,
): ExtractedMacros {
  const n = (nutriments || {}) as Record<string, unknown>;
  return {
    kcal: round1(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? null),
    protein: round1(n["proteins_100g"] ?? null),
    fat: round1(n["fat_100g"] ?? null),
    carbs: round1(n["carbohydrates_100g"] ?? null),
  };
}

function hasSomeMacro(m: ExtractedMacros): boolean {
  return (
    m.kcal != null || m.protein != null || m.fat != null || m.carbs != null
  );
}

// ── Barcode normalizer ───────────────────────────────────────────────────────

export function normalizeOFFBarcode(
  product: OFFProduct | null | undefined,
): NormalizedOFFBarcode | null {
  if (!product) return null;

  const name = product.product_name_uk || product.product_name || null;
  if (!name) return null;

  const macros = extractNutriments(product.nutriments);
  if (!hasSomeMacro(macros)) return null;

  const servingSize = product.serving_size
    ? String(product.serving_size)
    : null;
  const servingGrams =
    product.serving_quantity != null &&
    Number.isFinite(Number(product.serving_quantity))
      ? Number(product.serving_quantity)
      : null;

  return {
    name,
    brand: firstBrand(product.brands),
    kcal_100g: macros.kcal,
    protein_100g: macros.protein,
    fat_100g: macros.fat,
    carbs_100g: macros.carbs,
    servingSize,
    servingGrams,
    source: "off",
  };
}

// ── Search normalizer ────────────────────────────────────────────────────────

export function normalizeOFFSearch(
  product: OFFSearchProduct | null | undefined,
  stableId: (prefix: string, parts: Array<string | null | undefined>) => string,
): NormalizedOFFSearch | null {
  if (!product) return null;

  const name =
    product.product_name_uk ||
    (product.product_name &&
    /^[\u0020-\u024F\u0400-\u04FF]+$/.test(product.product_name)
      ? product.product_name
      : null) ||
    null;
  if (!name) return null;

  const macros = extractNutriments(product.nutriments);
  if (!hasSomeMacro(macros)) return null;

  const brand = firstBrand(product.brands);

  return {
    id: product.code
      ? `off_${String(product.code).replace(/^0+/, "") || "0"}`
      : stableId("off", [name, brand]),
    name,
    brand,
    source: "off",
    per100: {
      kcal: macros.kcal ?? 0,
      protein_g: macros.protein ?? 0,
      fat_g: macros.fat ?? 0,
      carbs_g: macros.carbs ?? 0,
    },
    defaultGrams: product.serving_quantity
      ? Math.round(Number(product.serving_quantity))
      : 100,
  };
}
