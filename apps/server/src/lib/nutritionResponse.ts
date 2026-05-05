function safeString(x: unknown, fallback = ""): string {
  return x == null ? fallback : String(x);
}

function safeNumberOrNull(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeNonNegNumberOrNull(x: unknown): number | null {
  const n = safeNumberOrNull(x);
  return n == null ? null : n >= 0 ? n : null;
}

function clamp01(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export interface PhotoMacros {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

export interface PhotoPortion {
  label: string | null;
  gramsApprox: number | null;
}

export interface PhotoIngredient {
  name: string;
  notes: string | null;
}

export interface NormalizedPhotoResult {
  dishName: string;
  confidence: number;
  portion: PhotoPortion | null;
  ingredients: PhotoIngredient[];
  macros: PhotoMacros;
  questions: string[];
}

export interface PantryItem {
  name: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

export type RecipeMacros = PhotoMacros;

export interface NormalizedRecipe {
  title: string;
  timeMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tips: string[];
  macros: RecipeMacros;
}

export function normalizePhotoResult(
  parsed: unknown,
  { fallbackGrams = null }: { fallbackGrams?: number | null } = {},
): NormalizedPhotoResult {
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const dishName =
    safeString(obj["dishName"], "Результат").trim() || "Результат";
  const confidence = clamp01(obj["confidence"]);

  const portionRaw = obj["portion"];
  const portion: PhotoPortion | null =
    portionRaw && typeof portionRaw === "object" && !Array.isArray(portionRaw)
      ? {
          label:
            safeString(
              (portionRaw as Record<string, unknown>)["label"],
              "",
            ).trim() || null,
          gramsApprox:
            (portionRaw as Record<string, unknown>)["gramsApprox"] == null
              ? null
              : safeNumberOrNull(
                  (portionRaw as Record<string, unknown>)["gramsApprox"],
                ),
        }
      : null;

  const ingredients: PhotoIngredient[] = Array.isArray(obj["ingredients"])
    ? (obj["ingredients"] as unknown[])
        .slice(0, 40)
        .map((x): PhotoIngredient | null => {
          if (!x || typeof x !== "object") return null;
          const rec = x as Record<string, unknown>;
          const name = safeString(rec["name"], "").trim();
          if (!name) return null;
          const notes =
            rec["notes"] == null || rec["notes"] === ""
              ? null
              : safeString(rec["notes"], "").trim();
          return { name, notes };
        })
        .filter((v): v is PhotoIngredient => Boolean(v))
    : [];

  const macrosRaw = obj["macros"];
  const macros =
    macrosRaw && typeof macrosRaw === "object" && !Array.isArray(macrosRaw)
      ? (macrosRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const outMacros: PhotoMacros = {
    kcal: safeNonNegNumberOrNull(macros["kcal"]),
    protein_g: safeNonNegNumberOrNull(macros["protein_g"]),
    fat_g: safeNonNegNumberOrNull(macros["fat_g"]),
    carbs_g: safeNonNegNumberOrNull(macros["carbs_g"]),
  };

  const questions: string[] = Array.isArray(obj["questions"])
    ? (obj["questions"] as unknown[])
        .map((q) => safeString(q, "").trim())
        .filter((v): v is string => Boolean(v))
        .slice(0, 6)
    : [];

  const finalPortion: PhotoPortion | null =
    portion ||
    (fallbackGrams != null
      ? { label: `${fallbackGrams} г`, gramsApprox: fallbackGrams }
      : null);

  return {
    dishName,
    confidence,
    portion: finalPortion,
    ingredients,
    macros: outMacros,
    questions,
  };
}

export function normalizePantryItems(parsed: unknown): PantryItem[] {
  const rawItems =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { items?: unknown }).items
      : parsed;
  const items: unknown[] = Array.isArray(rawItems) ? rawItems : [];
  return items
    .slice(0, 80)
    .map((x): PantryItem | null => {
      if (!x || typeof x !== "object") return null;
      const rec = x as Record<string, unknown>;
      const name = safeString(rec["name"], "").trim();
      if (!name) return null;
      const qty =
        rec["qty"] == null || rec["qty"] === ""
          ? null
          : safeNumberOrNull(rec["qty"]);
      let unit: string | null =
        rec["unit"] == null || rec["unit"] === ""
          ? null
          : safeString(rec["unit"], "").trim();
      if (qty != null && unit == null) unit = "шт";
      const notes =
        rec["notes"] == null || rec["notes"] === ""
          ? null
          : safeString(rec["notes"], "").trim();
      return { name, qty, unit, notes };
    })
    .filter((v): v is PantryItem => Boolean(v));
}

export function normalizeRecipes(parsed: unknown): NormalizedRecipe[] {
  const rawRecipes =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { recipes?: unknown }).recipes
      : parsed;
  const recipes: unknown[] = Array.isArray(rawRecipes) ? rawRecipes : [];
  return recipes
    .slice(0, 6)
    .map((r): NormalizedRecipe | null => {
      if (!r || typeof r !== "object") return null;
      const rec = r as Record<string, unknown>;
      const title = safeString(rec["title"], "").trim();
      const timeMinutes =
        rec["timeMinutes"] == null
          ? null
          : safeNumberOrNull(rec["timeMinutes"]);
      const servings =
        rec["servings"] == null ? null : safeNumberOrNull(rec["servings"]);
      const ingredients: string[] = Array.isArray(rec["ingredients"])
        ? (rec["ingredients"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 30)
        : [];
      const steps: string[] = Array.isArray(rec["steps"])
        ? (rec["steps"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 10)
        : [];
      const tips: string[] = Array.isArray(rec["tips"])
        ? (rec["tips"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 8)
        : [];
      const mRaw = rec["macros"];
      const m =
        mRaw && typeof mRaw === "object" && !Array.isArray(mRaw)
          ? (mRaw as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const macros: RecipeMacros = {
        kcal: safeNonNegNumberOrNull(m["kcal"]),
        protein_g: safeNonNegNumberOrNull(m["protein_g"]),
        fat_g: safeNonNegNumberOrNull(m["fat_g"]),
        carbs_g: safeNonNegNumberOrNull(m["carbs_g"]),
      };
      return {
        title: title || "Рецепт",
        timeMinutes,
        servings,
        ingredients,
        steps,
        tips,
        macros,
      };
    })
    .filter((v): v is NormalizedRecipe => Boolean(v));
}
