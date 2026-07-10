/**
 * Last validated: 2026-06-02
 * Status: Active
 *
 * RecipesCard — orchestrator for the recipe-feature UI on the Nutrition
 * Menu tab. Owns the persistence layer (IDB / SQLite overlay) and
 * delegates rendering to the two sub-cards:
 *
 *   • SavedSection   — "Мої рецепти" collapsible list
 *   • GeneratorCard  — prefs form + AI-generated recipe list
 *
 * Split from the original monolithic 600-LoC component in page-audit-08
 * F7 (docs/audits/2026-05-13-page-audit-08-nutrition.md) to comply with
 * Hard Rule #18 (max-lines: 600).
 */
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { toLocalISODate } from "@sergeant/shared";
import type { Meal, NutritionPrefs, Pantry } from "@sergeant/nutrition-domain";
import {
  deleteSavedRecipe,
  listSavedRecipes,
  saveRecipeToBook,
  scaleMacros,
  type SavedRecipe,
} from "../lib/recipeBook";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";
import type { RecipeCacheEntry as StoredRecipeCacheEntry } from "../lib/recipeCache";
import { MEAL_TYPES } from "../lib/mealTypes";
import { newMealId } from "../lib/mealId";
import { guessMealTypeIdNow, type RecipeLike } from "./RecipesCard.helpers";
import { SavedSection } from "./RecipesCard.SavedSection";
import { GeneratorCard } from "./RecipesCard.Generator";

interface RecipesCardProps {
  busy?: boolean;
  activePantry?: Pantry | null;
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  recommendRecipes: () => void | Promise<void>;
  recipes: RecipeLike[];
  recipesTried?: boolean;
  recipesRaw?: string;
  err?: string | null;
  fmtMacro: (v: unknown) => string | number;
  recipeCacheEntry?: StoredRecipeCacheEntry<unknown> | null;
  addMealToLog?: (meal: Meal) => void | Promise<void>;
  selectedDate?: string;
}

export function RecipesCard({
  busy,
  activePantry,
  prefs,
  setPrefs,
  recommendRecipes,
  recipes,
  recipesTried,
  recipesRaw,
  err,
  fmtMacro,
  recipeCacheEntry,
  addMealToLog,
  selectedDate,
}: RecipesCardProps) {
  const toast = useToast();
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [saved, setSaved] = useSqliteTickOverlay(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      if (cache.refreshedAt === null) return undefined;
      return cache.recipes;
    },
    () => [] as SavedRecipe[],
  );
  const [savedBusy, setSavedBusy] = useState(true);
  const [portionById, setPortionById] = useState<Record<string, string>>({});
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] =
    useState<SavedRecipe | null>(null);
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listSavedRecipes(200);
      if (!cancelled) setSaved(list);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSavedBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setSaved]);

  const [prevSavedLen, setPrevSavedLen] = useState(saved.length);
  if (saved.length > prevSavedLen && prevSavedLen === 0) {
    setPrevSavedLen(saved.length);
    setSavedOpen(true);
  } else if (saved.length !== prevSavedLen) {
    setPrevSavedLen(saved.length);
  }

  async function refreshSaved() {
    setSavedBusy(true);
    try {
      setSaved(await listSavedRecipes(200));
    } finally {
      setSavedBusy(false);
    }
  }

  async function saveOne(r: RecipeLike) {
    const res = await saveRecipeToBook(r);
    if (res.ok) await refreshSaved();
  }

  async function addRecipeAsMeal(
    r: RecipeLike | SavedRecipe,
    idKey: string,
  ): Promise<void> {
    if (typeof addMealToLog !== "function") return;
    const key = String(idKey || r?.id || r?.title || "");
    const factorRaw = portionById[key];
    const factor =
      factorRaw == null || factorRaw === ""
        ? 1
        : Number(String(factorRaw).replace(",", "."));
    const macros = scaleMacros(
      r?.macros,
      Number.isFinite(factor) && factor > 0 ? factor : 1,
    );
    const mealType = guessMealTypeIdNow();
    const label =
      MEAL_TYPES.find((x) => x.id === mealType)?.label || "Прийом їжі";
    // Не пишемо поточний час, якщо журнал відкритий не на сьогодні —
    // інакше "вчора 09:30" виглядає як артефакт. Див. H5 з аудиту.
    const now = new Date();
    const isToday = !selectedDate || selectedDate === toLocalISODate(now);
    const time = isToday
      ? // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- display time for meal log uses local wall-clock hours/minutes (cosmetic, not a day-boundary)
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      : "";
    await addMealToLog({
      id: newMealId(),
      time,
      mealType,
      label,
      name: r?.title || "Рецепт",
      macros: {
        kcal: macros.kcal ?? null,
        protein_g: macros.protein_g ?? null,
        fat_g: macros.fat_g ?? null,
        carbs_g: macros.carbs_g ?? null,
      },
      source: "manual",
      macroSource: "recipeAI",
      foodId: null,
      amount_g: null,
    });
  }

  return (
    <>
      {/* ── Мої рецепти ── */}
      <SavedSection
        saved={saved}
        savedBusy={savedBusy}
        savedOpen={savedOpen}
        setSavedOpen={setSavedOpen}
        openSavedId={openSavedId}
        setOpenSavedId={setOpenSavedId}
        portionById={portionById}
        setPortionById={setPortionById}
        onAddToLog={(r, key) => void addRecipeAsMeal(r, key)}
        onDeleteClick={setDeleteRecipeConfirm}
        fmtMacro={fmtMacro}
      />

      {/* ── Генератор рецептів ── */}
      <GeneratorCard
        busy={busy}
        activePantry={activePantry}
        prefs={prefs}
        setPrefs={setPrefs}
        recommendRecipes={recommendRecipes}
        recipes={recipes}
        recipesTried={recipesTried}
        recipesRaw={recipesRaw}
        err={err}
        fmtMacro={fmtMacro}
        recipeCacheEntry={recipeCacheEntry}
        onSave={(r) => void saveOne(r)}
        onAddToLog={(r, key) => void addRecipeAsMeal(r, key)}
      />

      <ConfirmDialog
        open={!!deleteRecipeConfirm}
        title="Видалити рецепт?"
        description={`Видалити збережений рецепт «${deleteRecipeConfirm?.title || ""}»?`}
        confirmLabel="Видалити"
        danger
        onConfirm={async () => {
          const removed = deleteRecipeConfirm;
          if (removed?.id) {
            await deleteSavedRecipe(removed.id);
            await refreshSaved();
            showUndoToast(toast, {
              msg: `Видалено рецепт «${removed.title}»`,
              onUndo: () => {
                void (async () => {
                  await saveRecipeToBook(removed);
                  await refreshSaved();
                })();
              },
            });
          }
          setDeleteRecipeConfirm(null);
        }}
        onCancel={() => setDeleteRecipeConfirm(null)}
      />
    </>
  );
}
