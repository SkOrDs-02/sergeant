import { useState, type Dispatch, type SetStateAction } from "react";

// Recipes/week-plan/day-plan payloads come from LLM responses. Their
// exact shape is validated at the consumer (`RecipesCard`, `DailyPlanCard`,
// `useNutritionRemoteActions`), so the UI-state hook just stores them
// as opaque objects keyed by field names the consumers agree on.
export type NutritionRecipe = Record<string, unknown>;
export type NutritionWeekPlan = {
  days?: unknown[];
  shoppingList?: unknown[];
  [key: string]: unknown;
};
export type NutritionDayPlan = {
  meals?: unknown[] | undefined;
  totalKcal?: number | undefined;
  note?: string | undefined;
  [key: string]: unknown;
};

export interface BackupPasswordDialogState {
  mode: "upload" | "download";
  title?: string;
  description?: string;
}

export interface RestoreConfirmState {
  payload: unknown;
}

export interface EditingMealState {
  id?: string;
  date?: string;
  [key: string]: unknown;
}

export interface UseNutritionUiStateResult {
  editingMeal: EditingMealState | null;
  setEditingMeal: Dispatch<SetStateAction<EditingMealState | null>>;

  recipes: NutritionRecipe[];
  setRecipes: Dispatch<SetStateAction<NutritionRecipe[]>>;
  recipesTried: boolean;
  setRecipesTried: Dispatch<SetStateAction<boolean>>;
  recipesRaw: string;
  setRecipesRaw: Dispatch<SetStateAction<string>>;

  weekPlan: NutritionWeekPlan | null;
  setWeekPlan: Dispatch<SetStateAction<NutritionWeekPlan | null>>;
  weekPlanRaw: string;
  setWeekPlanRaw: Dispatch<SetStateAction<string>>;
  weekPlanBusy: boolean;
  setWeekPlanBusy: Dispatch<SetStateAction<boolean>>;

  dayPlan: NutritionDayPlan | null;
  setDayPlan: Dispatch<SetStateAction<NutritionDayPlan | null>>;
  dayPlanBusy: boolean;
  setDayPlanBusy: Dispatch<SetStateAction<boolean>>;

  shoppingBusy: boolean;
  setShoppingBusy: Dispatch<SetStateAction<boolean>>;

  dayHintText: string;
  setDayHintText: Dispatch<SetStateAction<string>>;
  dayHintBusy: boolean;
  setDayHintBusy: Dispatch<SetStateAction<boolean>>;

  cloudBackupBusy: boolean;
  setCloudBackupBusy: Dispatch<SetStateAction<boolean>>;
  backupPasswordDialog: BackupPasswordDialogState | null;
  setBackupPasswordDialog: Dispatch<
    SetStateAction<BackupPasswordDialogState | null>
  >;
  restoreConfirm: RestoreConfirmState | null;
  setRestoreConfirm: Dispatch<SetStateAction<RestoreConfirmState | null>>;

  pantryScannerOpen: boolean;
  setPantryScannerOpen: Dispatch<SetStateAction<boolean>>;
  pantryScanStatus: string;
  setPantryScanStatus: Dispatch<SetStateAction<string>>;
}

export function useNutritionUiState(): UseNutritionUiStateResult {
  const [editingMeal, setEditingMeal] = useState<EditingMealState | null>(null);

  const [recipes, setRecipes] = useState<NutritionRecipe[]>([]);
  const [recipesTried, setRecipesTried] = useState(false);
  const [recipesRaw, setRecipesRaw] = useState("");

  const [weekPlan, setWeekPlan] = useState<NutritionWeekPlan | null>(null);
  const [weekPlanRaw, setWeekPlanRaw] = useState("");
  const [weekPlanBusy, setWeekPlanBusy] = useState(false);

  const [dayPlan, setDayPlan] = useState<NutritionDayPlan | null>(null);
  const [dayPlanBusy, setDayPlanBusy] = useState(false);

  const [shoppingBusy, setShoppingBusy] = useState(false);

  const [dayHintText, setDayHintText] = useState("");
  const [dayHintBusy, setDayHintBusy] = useState(false);

  const [cloudBackupBusy, setCloudBackupBusy] = useState(false);
  const [backupPasswordDialog, setBackupPasswordDialog] =
    useState<BackupPasswordDialogState | null>(null);
  const [restoreConfirm, setRestoreConfirm] =
    useState<RestoreConfirmState | null>(null);

  const [pantryScannerOpen, setPantryScannerOpen] = useState(false);
  const [pantryScanStatus, setPantryScanStatus] = useState("");

  return {
    editingMeal,
    setEditingMeal,
    recipes,
    setRecipes,
    recipesTried,
    setRecipesTried,
    recipesRaw,
    setRecipesRaw,
    weekPlan,
    setWeekPlan,
    weekPlanRaw,
    setWeekPlanRaw,
    weekPlanBusy,
    setWeekPlanBusy,
    dayPlan,
    setDayPlan,
    dayPlanBusy,
    setDayPlanBusy,
    shoppingBusy,
    setShoppingBusy,
    dayHintText,
    setDayHintText,
    dayHintBusy,
    setDayHintBusy,
    cloudBackupBusy,
    setCloudBackupBusy,
    backupPasswordDialog,
    setBackupPasswordDialog,
    restoreConfirm,
    setRestoreConfirm,
    pantryScannerOpen,
    setPantryScannerOpen,
    pantryScanStatus,
    setPantryScanStatus,
  };
}
