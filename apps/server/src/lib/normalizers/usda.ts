/**
 * USDA FoodData Central response normalizers.
 *
 * Two entry-points:
 * - `normalizeUSDABarcode` — single-product barcode lookup (Branded Foods API)
 * - `normalizeUSDASearch`  — multi-product search result
 *
 * Both consume raw USDA food shapes and apply shared nutrient-ID mapping,
 * differing only in the output contract.
 */

// ── Raw upstream types ───────────────────────────────────────────────────────

export interface USDAFoodNutrient {
  nutrientId?: number;
  nutrient?: { id?: number };
  value?: number;
  amount?: number;
}

export interface USDAFood {
  description?: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients?: USDAFoodNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
  gtinUpc?: string;
}

export interface USDASearchFood {
  fdcId?: number;
  description?: string;
  foodNutrients?: Array<{ nutrientId?: number; value?: number }>;
}

// ── Normalized output types ──────────────────────────────────────────────────

export interface NormalizedUSDABarcode {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingSize: string | null;
  servingGrams: number | null;
  source: "usda";
}

export interface NormalizedUSDASearch {
  id: string;
  name: string;
  brand: string | null;
  source: "usda";
  per100: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  defaultGrams: number;
}

// ── Nutrient ID constants ────────────────────────────────────────────────────

export const FDC_NUTRIENT = {
  kcal: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
} as const;

// ── Shared helpers ───────────────────────────────────────────────────────────

interface ExtractedMacros {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

function hasSomeMacro(m: ExtractedMacros): boolean {
  return (
    m.kcal != null || m.protein != null || m.fat != null || m.carbs != null
  );
}

function extractBarcodeNutrients(
  nutrients: USDAFoodNutrient[] | undefined | null,
): ExtractedMacros {
  const nutrientMap: Record<number, number> = {};
  for (const n of nutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const value = n.value ?? n.amount;
    if (id != null && value != null && Number.isFinite(Number(value))) {
      nutrientMap[id] = Math.round(Number(value) * 10) / 10;
    }
  }
  return {
    kcal: nutrientMap[FDC_NUTRIENT.kcal] ?? null,
    protein: nutrientMap[FDC_NUTRIENT.protein] ?? null,
    fat: nutrientMap[FDC_NUTRIENT.fat] ?? null,
    carbs: nutrientMap[FDC_NUTRIENT.carbs] ?? null,
  };
}

function extractSearchNutrients(
  nutrients: Array<{ nutrientId?: number; value?: number }> | undefined | null,
): ExtractedMacros {
  const arr = Array.isArray(nutrients) ? nutrients : [];
  const round1 = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v))
      ? Math.round(Number(v) * 10) / 10
      : null;
  const get = (id: number): number | null => {
    const n = arr.find((x) => x.nutrientId === id);
    return n?.value != null ? round1(n.value) : null;
  };
  return {
    kcal: get(FDC_NUTRIENT.kcal),
    protein: get(FDC_NUTRIENT.protein),
    fat: get(FDC_NUTRIENT.fat),
    carbs: get(FDC_NUTRIENT.carbs),
  };
}

// ── Barcode normalizer ───────────────────────────────────────────────────────

export function normalizeUSDABarcode(
  food: USDAFood | null | undefined,
): NormalizedUSDABarcode | null {
  if (!food) return null;
  const name = food.description || null;
  if (!name) return null;

  const brand = food.brandOwner || food.brandName || null;
  const macros = extractBarcodeNutrients(food.foodNutrients);

  const servingGrams =
    food.servingSize != null && Number.isFinite(Number(food.servingSize))
      ? Number(food.servingSize)
      : null;
  const servingUnit = food.servingSizeUnit || null;
  const servingSize =
    servingGrams && servingUnit ? `${servingGrams} ${servingUnit}` : null;

  if (!hasSomeMacro(macros)) return null;

  return {
    name,
    brand,
    kcal_100g: macros.kcal,
    protein_100g: macros.protein,
    fat_100g: macros.fat,
    carbs_100g: macros.carbs,
    servingSize,
    servingGrams,
    source: "usda",
  };
}

// ── Search normalizer ────────────────────────────────────────────────────────

export function normalizeUSDASearch(
  food: USDASearchFood | null | undefined,
  stableId: (prefix: string, parts: Array<string | null | undefined>) => string,
): NormalizedUSDASearch | null {
  const name = food?.description;
  if (!name) return null;

  const macros = extractSearchNutrients(food?.foodNutrients);
  if (!hasSomeMacro(macros)) return null;

  return {
    id:
      food?.fdcId != null
        ? `usda_${String(food.fdcId)}`
        : stableId("usda", [name]),
    name,
    brand: null,
    source: "usda",
    per100: {
      kcal: macros.kcal ?? 0,
      protein_g: macros.protein ?? 0,
      fat_g: macros.fat ?? 0,
      carbs_g: macros.carbs ?? 0,
    },
    defaultGrams: 100,
  };
}
