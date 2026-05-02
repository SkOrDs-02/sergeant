// Five-tab structure after UX audit: start / pantry / log / menu
// (merge of plan+recipes). Shopping now lives as an internal tab inside
// pantry, so `#shop` redirects to `#pantry`. Legacy `#plan` and `#recipes`
// both redirect to `#menu`.
export type NutritionPage = "start" | "pantry" | "log" | "menu";

const VALID_NUTRITION_PAGES: readonly NutritionPage[] = [
  "start",
  "pantry",
  "log",
  "menu",
];

const LEGACY_REDIRECTS: Record<string, NutritionPage> = {
  products: "pantry",
  plan: "menu",
  recipes: "menu",
  shop: "pantry",
};

/** Valid sub-tab ids per page. Only pages that have sub-tabs are listed. */
export type PantrySubTab = "items" | "shopping";
export type MenuSubTab = "plan" | "recipes";

const VALID_PANTRY_SUBS: readonly string[] = ["items", "shopping"];
const VALID_MENU_SUBS: readonly string[] = ["plan", "recipes"];

export interface ParsedNutritionHash {
  page: NutritionPage;
  /** Sub-tab segment parsed from `#page/sub`. `undefined` when absent. */
  subTab?: string;
  redirectFrom?: string;
}

export function parseNutritionHash(): ParsedNutritionHash {
  const raw = (window.location.hash || "").replace(/^#/, "").trim();
  if (!raw || raw.startsWith("/")) return { page: "start" };
  const [page, sub] = raw.split("/").filter(Boolean);
  const redirect = LEGACY_REDIRECTS[page];
  if (redirect) return { page: redirect, redirectFrom: page };
  if (!VALID_NUTRITION_PAGES.includes(page as NutritionPage))
    return { page: "start" };

  // Validate sub-tab against the page's allowed set
  let validSub: string | undefined;
  if (page === "pantry" && sub && VALID_PANTRY_SUBS.includes(sub)) {
    validSub = sub;
  } else if (page === "menu" && sub && VALID_MENU_SUBS.includes(sub)) {
    validSub = sub;
  }
  return { page: page as NutritionPage, subTab: validSub };
}

export function setNutritionHash(
  next: NutritionPage | null | undefined,
  subTab?: string,
): void {
  const page = next || "start";
  const h = subTab ? `#${page}/${subTab}` : `#${page}`;
  if (window.location.hash === h) return;
  window.location.hash = h;
}
