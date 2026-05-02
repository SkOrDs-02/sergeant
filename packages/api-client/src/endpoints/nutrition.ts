import type { HttpClient } from "../httpClient";

// ---------------------------------------------------------------------------
// Response shapes returned by `apps/server/src/modules/nutrition/*`.
// These match the server normalizers in
// `apps/server/src/modules/nutrition/lib/nutritionResponse.js` and inline
// normalizers in individual handlers.
// ---------------------------------------------------------------------------

export interface NutritionMacros {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

// analyze-photo / refine-photo
export interface NutritionPhotoPortion {
  label: string | null;
  gramsApprox: number | null;
}

export interface NutritionPhotoIngredient {
  name: string;
  notes: string | null;
}

export interface NutritionPhotoResult {
  dishName: string;
  confidence: number;
  portion: NutritionPhotoPortion | null;
  ingredients: NutritionPhotoIngredient[];
  macros: NutritionMacros;
  questions: string[];
}

export interface NutritionPhotoResponse {
  result: NutritionPhotoResult | null;
  rawText: string | null;
}

// recommend-recipes
export interface NutritionRecipe {
  title: string;
  timeMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tips: string[];
  macros: NutritionMacros;
}

export interface NutritionRecipesResponse {
  recipes: NutritionRecipe[];
  rawText: string | null;
}

// week-plan
export interface NutritionWeekDay {
  label: string;
  note: string;
  meals: string[];
}

export interface NutritionWeekPlan {
  days: NutritionWeekDay[];
  shoppingList: string[];
}

export interface NutritionWeekPlanResponse {
  plan: NutritionWeekPlan;
  rawText: string | null;
}

// day-plan
export type NutritionMealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface NutritionDayMeal {
  type: NutritionMealType;
  label: string;
  name: string;
  description: string;
  ingredients: string[];
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

export interface NutritionDayPlan {
  meals: NutritionDayMeal[];
  totalKcal: number | null;
  totalProtein_g: number | null;
  totalFat_g: number | null;
  totalCarbs_g: number | null;
  note: string;
}

export interface NutritionDayPlanResponse {
  plan: NutritionDayPlan;
  rawText?: string | null;
}

// day-hint
export interface NutritionDayHintResponse {
  hint: string;
}

// shopping-list
export interface NutritionShoppingItem {
  name: string;
  quantity: string;
  note: string;
}

export interface NutritionShoppingCategory {
  name: string;
  items: NutritionShoppingItem[];
}

export interface NutritionShoppingListResponse {
  categories: NutritionShoppingCategory[];
  rawText: string | null;
}

// parse-pantry
export interface NutritionPantryItem {
  name: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

export interface NutritionParsePantryResponse {
  items: NutritionPantryItem[];
  rawText: string | null;
}

// backup-upload / backup-download
export interface NutritionBackupUploadResponse {
  ok: true;
  savedAt: number;
}

export interface NutritionBackupDownloadResponse {
  ok: true;
  blob: unknown;
}

export interface NutritionEndpoints {
  postJson: <T = unknown>(url: string, body: unknown) => Promise<T>;
  analyzePhoto: (body: unknown) => Promise<NutritionPhotoResponse>;
  refinePhoto: (body: unknown) => Promise<NutritionPhotoResponse>;
  recommendRecipes: (body: unknown) => Promise<NutritionRecipesResponse>;
  weekPlan: (body: unknown) => Promise<NutritionWeekPlanResponse>;
  dayPlan: (body: unknown) => Promise<NutritionDayPlanResponse>;
  dayHint: (body: unknown) => Promise<NutritionDayHintResponse>;
  shoppingList: (body: unknown) => Promise<NutritionShoppingListResponse>;
  parsePantry: (body: unknown) => Promise<NutritionParsePantryResponse>;
  backupUpload: (body: {
    blob: unknown;
  }) => Promise<NutritionBackupUploadResponse>;
  backupDownload: () => Promise<NutritionBackupDownloadResponse>;
}

export function createNutritionEndpoints(http: HttpClient): NutritionEndpoints {
  function postNutrition<T>(path: string, body: unknown): Promise<T> {
    return http.post<T>(path, body ?? {});
  }

  return {
    postJson: <T = unknown>(url: string, body: unknown) =>
      postNutrition<T>(url, body),
    analyzePhoto: (body) =>
      postNutrition<NutritionPhotoResponse>(
        "/api/nutrition/analyze-photo",
        body,
      ),
    refinePhoto: (body) =>
      postNutrition<NutritionPhotoResponse>(
        "/api/nutrition/refine-photo",
        body,
      ),
    recommendRecipes: (body) =>
      postNutrition<NutritionRecipesResponse>(
        "/api/nutrition/recommend-recipes",
        body,
      ),
    weekPlan: (body) =>
      postNutrition<NutritionWeekPlanResponse>(
        "/api/nutrition/week-plan",
        body,
      ),
    dayPlan: (body) =>
      postNutrition<NutritionDayPlanResponse>("/api/nutrition/day-plan", body),
    dayHint: (body) =>
      postNutrition<NutritionDayHintResponse>("/api/nutrition/day-hint", body),
    shoppingList: (body) =>
      postNutrition<NutritionShoppingListResponse>(
        "/api/nutrition/shopping-list",
        body,
      ),
    parsePantry: (body) =>
      postNutrition<NutritionParsePantryResponse>(
        "/api/nutrition/parse-pantry",
        body,
      ),
    backupUpload: (body) =>
      postNutrition<NutritionBackupUploadResponse>(
        "/api/nutrition/backup-upload",
        body,
      ),
    backupDownload: () =>
      postNutrition<NutritionBackupDownloadResponse>(
        "/api/nutrition/backup-download",
        {},
      ),
  };
}
