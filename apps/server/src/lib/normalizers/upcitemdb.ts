/**
 * UPCitemdb response normalizer.
 *
 * UPCitemdb (https://www.upcitemdb.com/) — third-tier barcode source
 * after OFF та USDA: ~694M barcodes, no API key, 100 req/day на trial.
 * Здебільшого має name + brand, рідко — будь-яку нутрицію для food-items.
 * Тому нормалізований продукт завжди матиме `partial: true` і всі
 * макроси `null` — фронт сам promt-уватиме юзера заповнити.
 *
 * Один entry-point:
 * - `normalizeUPCitemdb` — single-product barcode lookup.
 */

// ── Raw upstream types ───────────────────────────────────────────────────────

export interface UPCitemdbItem {
  title?: string;
  brand?: string;
}

export interface UPCitemdbResponse {
  items?: UPCitemdbItem[];
}

// ── Normalized output type ───────────────────────────────────────────────────

export interface NormalizedUPCitemdbBarcode {
  name: string;
  brand: string | null;
  kcal_100g: null;
  protein_100g: null;
  fat_100g: null;
  carbs_100g: null;
  servingSize: null;
  servingGrams: null;
  source: "upcitemdb";
  partial: true;
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Normalize raw UPCitemdb `lookup` response. Returns null when:
 * - `data` is null/undefined,
 * - `items` array is missing/empty,
 * - first item lacks a usable `title` (the only mandatory field).
 *
 * Brand-less items are accepted (`brand` нормалізується до `null`).
 *
 * Семантика `partial: true` — UPCitemdb рідко повертає macros для food-items,
 * тож фронт показує "fill-macros" prompt, а не сприймає продукт як готовий
 * до додавання в meal-log без подальших дій юзера.
 */
export function normalizeUPCitemdb(
  data: UPCitemdbResponse | null | undefined,
): NormalizedUPCitemdbBarcode | null {
  if (!data) return null;
  const items = Array.isArray(data.items) ? data.items : null;
  if (!items || items.length === 0) return null;

  const item = items[0];
  if (!item) return null;

  const name = typeof item.title === "string" ? item.title.trim() : "";
  if (!name) return null;

  const brandRaw = typeof item.brand === "string" ? item.brand.trim() : "";
  const brand = brandRaw || null;

  return {
    name,
    brand,
    kcal_100g: null,
    protein_100g: null,
    fat_100g: null,
    carbs_100g: null,
    servingSize: null,
    servingGrams: null,
    source: "upcitemdb",
    partial: true,
  };
}
