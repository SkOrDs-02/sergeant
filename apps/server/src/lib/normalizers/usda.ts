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
  /**
   * Foundation / SR Legacy продукти віддають енергію не як 1008 (Energy), а як
   * Atwater General Factors (2047) чи Atwater Specific Factors (2048). Без
   * цих id гречка з Foundation мала "0 ккал" при 71 г вуглеводів (data-43
   * аудиту 2026-10-01).
   */
  kcalAtwaterGeneral: 2047,
  kcalAtwaterSpecific: 2048,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
} as const;

/**
 * Atwater, ккал/г: білок 4, вуглеводи 4, жири 9 — фізичні константи, ті самі,
 * що `ATWATER_KCAL_PER_G` у `@sergeant/nutrition-domain`. Продубльовано
 * свідомо: `apps/server` не залежить від цього пакета, а тягти залежність
 * (і lockfile) заради трьох чисел не варто.
 */
const ATWATER_KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 } as const;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Енергія з БЖВ за Atwater, коли USDA не віддав жодного id енергії.
 * `null`, якщо макро немає взагалі (нема з чого рахувати).
 */
function kcalFromAtwater(m: ExtractedMacros): number | null {
  if (m.protein == null && m.fat == null && m.carbs == null) return null;
  return round1(
    (m.protein ?? 0) * ATWATER_KCAL_PER_G.protein +
      (m.fat ?? 0) * ATWATER_KCAL_PER_G.fat +
      (m.carbs ?? 0) * ATWATER_KCAL_PER_G.carbs,
  );
}

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
    kcal:
      nutrientMap[FDC_NUTRIENT.kcal] ??
      nutrientMap[FDC_NUTRIENT.kcalAtwaterGeneral] ??
      nutrientMap[FDC_NUTRIENT.kcalAtwaterSpecific] ??
      null,
    protein: nutrientMap[FDC_NUTRIENT.protein] ?? null,
    fat: nutrientMap[FDC_NUTRIENT.fat] ?? null,
    carbs: nutrientMap[FDC_NUTRIENT.carbs] ?? null,
  };
}

function extractSearchNutrients(
  nutrients: Array<{ nutrientId?: number; value?: number }> | undefined | null,
): ExtractedMacros {
  const arr = Array.isArray(nutrients) ? nutrients : [];
  const get = (id: number): number | null => {
    const v = arr.find((x) => x.nutrientId === id)?.value;
    return v != null && Number.isFinite(Number(v)) ? round1(Number(v)) : null;
  };
  return {
    kcal:
      get(FDC_NUTRIENT.kcal) ??
      get(FDC_NUTRIENT.kcalAtwaterGeneral) ??
      get(FDC_NUTRIENT.kcalAtwaterSpecific),
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
  // Контракт відповіді (`kcal: number`) не міняємо: коли USDA не дав енергії
  // ні як 1008, ні як 2047/2048, рахуємо її з БЖВ. Підстановка 0 мовчки
  // занижувала денні підсумки (data-43).
  const kcal = macros.kcal ?? kcalFromAtwater(macros) ?? 0;

  return {
    id:
      food?.fdcId != null
        ? `usda_${String(food.fdcId)}`
        : stableId("usda", [name]),
    name,
    brand: null,
    source: "usda",
    per100: {
      kcal,
      protein_g: macros.protein ?? 0,
      fat_g: macros.fat ?? 0,
      carbs_g: macros.carbs ?? 0,
    },
    defaultGrams: 100,
  };
}
