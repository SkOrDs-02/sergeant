/**
 * FNV-1a 32-bit → base36. Канонічна реалізація для стабільних коротких
 * хешів у nutrition-шарі (recipe id, ключі кешу рецептів). Експортовано,
 * щоб споживачі (web/mobile recipeCache) не тримали власних копій.
 */
export function shortHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface StableRecipeIdInput {
  title?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  timeMinutes?: unknown;
  servings?: unknown;
}

export function stableRecipeId(r: unknown): string {
  const obj =
    r && typeof r === "object"
      ? (r as StableRecipeIdInput)
      : ({} as StableRecipeIdInput);
  const title = String(obj.title || "").trim();
  const ingredients = Array.isArray(obj.ingredients)
    ? obj.ingredients.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const steps = Array.isArray(obj.steps)
    ? obj.steps.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const raw = [
    title,
    `t=${obj.timeMinutes ?? ""}`,
    `s=${obj.servings ?? ""}`,
    ingredients.join("|"),
    steps.slice(0, 10).join("|"),
  ].join("\n");
  return `rcp_ai_${shortHash(raw)}`;
}
