import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { nutritionApi } from "@shared/api";
import {
  generatePrefixedId,
  pantryModeAvailabilityError,
} from "@sergeant/shared";
import { deviceDayKey, deviceTimeOfDay } from "@sergeant/nutrition-domain";
import type {
  NutritionDayMeal,
  NutritionDayPlan as ApiNutritionDayPlan,
  NutritionMealType,
  NutritionRecipe as ApiNutritionRecipe,
  NutritionShoppingCategory,
  NutritionWeekPlan as ApiNutritionWeekPlan,
} from "@shared/api";
import { formatNutritionError } from "../lib/nutritionErrors";
import { writeRecipeCache } from "../lib/recipeCache";
import { stableRecipeId } from "../lib/recipeIds";
import { newMealId } from "../lib/mealId";
import type { Meal, NutritionLogLike } from "../lib/nutritionStorage";
import type { PantryItem } from "../lib/pantryTextParser";
import type {
  NutritionDayPlan as UiNutritionDayPlan,
  NutritionRecipe as UiNutritionRecipe,
  NutritionWeekPlan as UiNutritionWeekPlan,
} from "./useNutritionUiState";
import type { ShoppingCategory } from "../lib/shoppingListStorage";

type AnySetter<T = unknown> =
  Dispatch<SetStateAction<T>> | ((value: T) => void);

interface BuildMutationHandlersParams<TData> {
  setBusy?: AnySetter<boolean>;
  setErr?: AnySetter<string>;
  setStatusText?: AnySetter<string>;
  fallbackError: string;
  onSuccessSideEffects?: (data: TData) => void;
  onMutateSideEffects?: {
    statusText?: string;
    run?: () => void;
  };
}

/**
 * React Query mutation factory — wraps a `postJson` call and wires the
 * shared `setBusy` / `setErr` / `setStatusText` lifecycle so the hook's
 * public surface stays identical to the pre-RQ version.
 *
 * `statusText` is set on mutate and cleared on settle; `busy` flags (per
 * action) and error banner mirror the previous try/catch/finally shape.
 */
function buildMutationHandlers<TData>({
  setBusy,
  setErr,
  setStatusText,
  fallbackError,
  onSuccessSideEffects,
  onMutateSideEffects,
}: BuildMutationHandlersParams<TData>) {
  return {
    onMutate: () => {
      setBusy?.(true);
      setErr?.("");
      if (setStatusText && onMutateSideEffects?.statusText) {
        setStatusText(onMutateSideEffects.statusText);
      }
      onMutateSideEffects?.run?.();
    },
    onSuccess: (data: TData) => {
      onSuccessSideEffects?.(data);
    },
    onError: (err: unknown) => {
      setErr?.(formatNutritionError(err, fallbackError));
    },
    onSettled: () => {
      setBusy?.(false);
      if (setStatusText && onMutateSideEffects?.statusText) {
        setStatusText("");
      }
    },
  };
}

/**
 * Minimal shape of `useNutritionPantries()` that this hook consumes.
 * The full return type of that hook is bigger — we only need the parsed
 * pantry items here, so requiring the whole thing would over-couple.
 */
export interface RemoteActionsPantry {
  effectiveItems: PantryItem[];
}

/**
 * Subset of `NutritionPrefs` that the remote actions hook reads when
 * building request payloads. Kept narrow on purpose so tests can pass
 * a mock that only fills the fields that matter.
 */
export interface RemoteActionsPrefs {
  goal: string;
  servings?: number | string | null;
  timeMinutes?: number | string | null;
  exclude?: string | null;
  recipeMealType?: "any" | "breakfast" | "lunch" | "dinner" | "snack";
  recipePantryMode?: "prefer" | "only" | "ignore";
  dailyTargetKcal: number | null;
  dailyTargetProtein_g: number | null;
  dailyTargetFat_g: number | null;
  dailyTargetCarbs_g: number | null;
}

/**
 * Subset of `useNutritionLog()` return used by `addMealFromPlan`.
 */
export interface RemoteActionsLog {
  nutritionLog: NutritionLogLike;
  selectedDate: string;
  handleAddMeal: (meal: Partial<Meal>) => void;
}

/**
 * Subset of `useShoppingList()` used by `generateShoppingList`.
 */
export interface RemoteActionsShopping {
  setGeneratedList: (categories: ShoppingCategory[] | null | undefined) => void;
}

/**
 * Payload the `setDayPlan` updater receives on a partial regeneration —
 * we fold the new plan into the previous one per meal type, so typing
 * `prev` strictly keeps the reducer honest about which fields exist.
 */
type DayPlanWithMeals = Omit<UiNutritionDayPlan, "meals"> & {
  meals?: NutritionDayMeal[];
};

export interface UseNutritionRemoteActionsParams {
  setBusy: AnySetter<boolean>;
  setErr: AnySetter<string>;
  setStatusText: AnySetter<string>;
  pantry: RemoteActionsPantry;
  prefs: RemoteActionsPrefs;
  recipes: UiNutritionRecipe[];
  setRecipes: (value: UiNutritionRecipe[]) => void;
  setRecipesRaw: (value: string) => void;
  setRecipesTried: (value: boolean) => void;
  recipeCacheKey: string;
  weekPlan: UiNutritionWeekPlan | null;
  setWeekPlan: (value: UiNutritionWeekPlan | null) => void;
  /** Потрібен для відкату: структура і сирий текст мають вертатись разом. */
  weekPlanRaw: string;
  setWeekPlanRaw: (value: string) => void;
  setWeekPlanBusy: AnySetter<boolean>;
  setDayPlan: Dispatch<SetStateAction<UiNutritionDayPlan | null>>;
  setDayPlanBusy: AnySetter<boolean>;
  log: RemoteActionsLog;
  shopping: RemoteActionsShopping;
  setShoppingBusy: AnySetter<boolean>;
}

/**
 * Payload the api-client returns from `recommendRecipes` before we tag
 * each recipe with a stable id. Keeping it local avoids reaching into
 * the api-client types for a structural detail that is only used at
 * this boundary.
 */
type RecipeFromApi = ApiNutritionRecipe & { id?: unknown };

/**
 * Режим комори з prefs. Один вибір користувача («Як враховувати комору» в
 * «Меню») керує ВСІМА трьома генераторами: рецепти, денний план, тижневий.
 */
function pantryModeOf(prefs: RemoteActionsPrefs): "prefer" | "only" | "ignore" {
  return prefs.recipePantryMode ?? "prefer";
}

/**
 * Комора для тіла запиту. При `ignore` шлемо порожній список навмисно:
 * інструкція «не враховуй комору» поруч зі списком продуктів — слабкий
 * важіль, модель усе одно тягне страви зі списку. Не показати списку —
 * надійніше, ніж попросити його не використовувати.
 */
function pantryPayload(
  items: PantryItem[],
  mode: "prefer" | "only" | "ignore",
  limit: number,
): PantryItem[] {
  return mode === "ignore" ? [] : items.slice(0, limit);
}

function assertPantryModeAvailable(
  items: PantryItem[],
  mode: "prefer" | "only" | "ignore",
): void {
  const error = pantryModeAvailabilityError(items, mode);
  if (error) throw new Error(error);
}

/**
 * UX-1 (аудит 2026-09-01): `dayPlan` повертав голе «Не вдалося отримати
 * план харчування» без причини й дії — той самий клас, що
 * `pantryModeAvailabilityError` вище вже лагодить для суміжної гілки
 * («тільки з наявного»). Причина відома в момент кидання (режим комори),
 * тож повідомлення несе її прямо, а не узагальнює до одного тексту на всі
 * випадки — за структурою style guide `[Що сталося.] [Що зроби.]`.
 */
function emptyDayPlanErrorMessage(mode: "prefer" | "only" | "ignore"): string {
  return mode === "only"
    ? "AI не зміг скласти план тільки з наявних продуктів. Додай ще позицій у комору або зміни режим комори."
    : "AI повернув порожній план харчування. Спробуй згенерувати ще раз.";
}

/** Coerce a possibly-numeric pref value to a number with a fallback. */
function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The shopping-list API returns categories without per-item `id` /
 * `checked` (those live only in LS state). We mint them here so the
 * downstream `ShoppingList` state stays well-formed.
 */
function adaptShoppingCategories(
  categories: readonly NutritionShoppingCategory[],
): ShoppingCategory[] {
  return categories.map((cat, catIdx) => ({
    name: String(cat.name ?? ""),
    items: (Array.isArray(cat.items) ? cat.items : []).map((it, itIdx) => ({
      id: `sl_${catIdx}_${itIdx}_${generatePrefixedId("sl")}`,
      name: String(it.name ?? ""),
      quantity: String(it.quantity ?? ""),
      note: String(it.note ?? ""),
      checked: false,
    })),
  }));
}

export function useNutritionRemoteActions({
  // shared state
  setBusy,
  setErr,
  setStatusText,
  // pantry + prefs
  pantry,
  prefs,
  // recipes
  recipes,
  setRecipes,
  setRecipesRaw,
  setRecipesTried,
  recipeCacheKey,
  // week plan
  weekPlan,
  setWeekPlan,
  weekPlanRaw,
  setWeekPlanRaw,
  setWeekPlanBusy,
  // day plan
  setDayPlan,
  setDayPlanBusy,
  // log + shopping
  log,
  shopping,
  setShoppingBusy,
}: UseNutritionRemoteActionsParams) {
  // ─── Recipes ────────────────────────────────────────────────────────────
  const recipesMutation = useMutation({
    mutationFn: () => {
      const items = pantry.effectiveItems;
      const mode = pantryModeOf(prefs);
      assertPantryModeAvailable(items, mode);
      return nutritionApi.recommendRecipes({
        pantry: pantryPayload(items, mode, 40),
        preferences: {
          goal: prefs.goal,
          servings: toNumber(prefs.servings, 1),
          timeMinutes: toNumber(prefs.timeMinutes, 25),
          exclude: String(prefs.exclude || ""),
          mealType: prefs.recipeMealType ?? "any",
          pantryMode: mode,
          locale: "uk-UA",
        },
      });
    },
    ...buildMutationHandlers<
      Awaited<ReturnType<typeof nutritionApi.recommendRecipes>>
    >({
      setBusy,
      setErr,
      setStatusText,
      fallbackError: "Помилка рекомендацій",
      onMutateSideEffects: {
        statusText: "Генерую рецепти…",
        run: () => {
          setRecipes([]);
          setRecipesRaw("");
          setRecipesTried(true);
        },
      },
      onSuccessSideEffects: (data) => {
        const list: UiNutritionRecipe[] = Array.isArray(data?.recipes)
          ? (data.recipes as RecipeFromApi[]).map((r) => ({
              ...r,
              id: r?.id ? String(r.id) : stableRecipeId(r),
            }))
          : [];
        const raw = typeof data?.rawText === "string" ? data.rawText : "";
        setRecipes(list);
        setRecipesRaw(raw);
        writeRecipeCache(recipeCacheKey, { recipes: list, recipesRaw: raw });
      },
    }),
  });

  const recommendRecipes = useCallback(
    () => recipesMutation.mutate(),
    [recipesMutation],
  );

  // ─── Week plan ──────────────────────────────────────────────────────────
  const weekPlanMutation = useMutation({
    mutationFn: () => {
      const mode = pantryModeOf(prefs);
      assertPantryModeAvailable(pantry.effectiveItems, mode);
      return nutritionApi.weekPlan({
        pantry: pantryPayload(pantry.effectiveItems, mode, 50),
        pantryMode: mode,
        preferences: { goal: prefs.goal },
        locale: "uk-UA",
      });
    },
    onMutate: () => {
      setWeekPlanBusy(true);
      setErr("");
      // Знімок для відкату. `plan` і `raw` — два представлення ОДНІЄЇ
      // відповіді LLM, тож і зберігаються, і вертаються разом. Раніше тут
      // лежав лише `plan`, і невдала генерація лишала структуру старого
      // покоління поряд із сирим текстом нового. Доки стан жив у памʼяті,
      // розбіжність помирала на розмонтуванні; відколи план пишеться у
      // сховище — вона переживає перезапуск.
      return { prevWeekPlan: weekPlan, prevWeekPlanRaw: weekPlanRaw };
    },
    onSuccess: (data) => {
      const plan = (data?.plan ?? null) as
        (ApiNutritionWeekPlan & Record<string, unknown>) | null;
      setWeekPlan(plan);
      setWeekPlanRaw(typeof data?.rawText === "string" ? data.rawText : "");
      hapticSuccess();
    },
    onError: (err, _vars, ctx) => {
      // Rollback to previous week plan on failure
      if (ctx) {
        setWeekPlan(ctx.prevWeekPlan);
        setWeekPlanRaw(ctx.prevWeekPlanRaw);
      }
      setErr(formatNutritionError(err, "Помилка плану"));
    },
    onSettled: () => {
      setWeekPlanBusy(false);
    },
  });

  const fetchWeekPlan = useCallback(
    () => weekPlanMutation.mutate(),
    [weekPlanMutation],
  );

  // ─── Day plan ───────────────────────────────────────────────────────────
  const dayPlanMutation = useMutation({
    mutationFn: (regenerateMealType: string | null | undefined) => {
      const mode = pantryModeOf(prefs);
      assertPantryModeAvailable(pantry.effectiveItems, mode);
      return nutritionApi
        .dayPlan({
          pantry: pantryPayload(pantry.effectiveItems, mode, 50),
          pantryMode: mode,
          targets: {
            kcal: prefs.dailyTargetKcal,
            protein_g: prefs.dailyTargetProtein_g,
            fat_g: prefs.dailyTargetFat_g,
            carbs_g: prefs.dailyTargetCarbs_g,
          },
          ...(regenerateMealType ? { regenerateMealType } : {}),
          locale: "uk-UA",
        })
        .then((data) => {
          const plan = data?.plan;
          if (!plan || !Array.isArray(plan.meals) || plan.meals.length === 0) {
            throw new Error(emptyDayPlanErrorMessage(mode));
          }
          return { plan, regenerateMealType };
        });
    },
    onMutate: (regenerateMealType) => {
      setDayPlanBusy(true);
      setErr("");
      // Capture current day plan for rollback — only when regenerating a
      // specific meal type (full regen intentionally clears the old plan).
      return regenerateMealType
        ? { prevDayPlan: null as UiNutritionDayPlan | null }
        : {};
    },
    onSuccess: ({
      plan,
      regenerateMealType,
    }: {
      plan: ApiNutritionDayPlan;
      regenerateMealType: string | null | undefined;
    }) => {
      setDayPlan((prev) => {
        const prevWithMeals = prev as DayPlanWithMeals | null;
        if (
          regenerateMealType &&
          prevWithMeals?.meals &&
          prevWithMeals.meals.length > 0
        ) {
          const newMeals: NutritionDayMeal[] = Array.isArray(plan.meals)
            ? (plan.meals as NutritionDayMeal[])
            : [];
          const merged: NutritionDayMeal[] = [
            ...prevWithMeals.meals.filter(
              (m) => m.type !== (regenerateMealType as NutritionMealType),
            ),
            ...newMeals.filter(
              (m) => m.type === (regenerateMealType as NutritionMealType),
            ),
          ];
          interface PlanTotals {
            totalKcal?: number;
            totalProtein_g?: number;
            totalFat_g?: number;
            totalCarbs_g?: number;
          }
          const totals = merged.reduce<PlanTotals>(
            (acc, m) => ({
              totalKcal: (acc.totalKcal ?? 0) + (m.kcal ?? 0),
              totalProtein_g: (acc.totalProtein_g ?? 0) + (m.protein_g ?? 0),
              totalFat_g: (acc.totalFat_g ?? 0) + (m.fat_g ?? 0),
              totalCarbs_g: (acc.totalCarbs_g ?? 0) + (m.carbs_g ?? 0),
            }),
            {},
          );
          return { ...prevWithMeals, meals: merged, ...totals };
        }
        return {
          ...plan,
          totalKcal: plan.totalKcal ?? undefined,
          totalProtein_g: plan.totalProtein_g ?? undefined,
          totalFat_g: plan.totalFat_g ?? undefined,
          totalCarbs_g: plan.totalCarbs_g ?? undefined,
        };
      });
    },
    onError: (err, _vars, ctx) => {
      // Rollback partial regen on failure so the previous plan stays visible
      if (ctx && "prevDayPlan" in ctx && ctx.prevDayPlan !== undefined) {
        setDayPlan(ctx.prevDayPlan);
      }
      setErr(formatNutritionError(err, "Помилка генерації плану"));
    },
    onSettled: () => {
      setDayPlanBusy(false);
    },
  });

  const fetchDayPlan = useCallback(
    (regenerateMealType?: string | null) =>
      dayPlanMutation.mutate(regenerateMealType),
    [dayPlanMutation],
  );

  // ─── Add meal from plan (local-only; no network) ────────────────────────
  interface PlanMealInput {
    type?: string;
    name?: string;
    kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  }
  const addMealFromPlan = useCallback(
    (meal: PlanMealInput) => {
      const id = newMealId();
      const typeLabels: Record<string, string> = {
        breakfast: "Сніданок",
        lunch: "Обід",
        dinner: "Вечеря",
        snack: "Перекус",
      };
      // Тільки коли користувач переглядає сьогодні, ставимо поточний час —
      // інакше для минулих/майбутніх днів сьогоднішній час виглядав би як баг
      // (запис "вчора 09:30 ранку" створений увечері). Див. H5 з аудиту.
      const now = new Date();
      // ADR-0078: `log.selectedDate` is the device-local day key the log is
      // written under (useNutritionLog) — comparing against a Kyiv key here
      // would desync this check the moment device tz != Kyiv.
      const isToday = log.selectedDate === deviceDayKey(now);
      // ADR-0078: час доби беремо з того самого годинника, що й день-ключ
      // вище (`deviceDayKey`). Київський настінний час поруч із девайсовим
      // днем дає пару, з якої `composeEatenAt` складав неіснуючий момент.
      const time = isToday ? deviceTimeOfDay(now) : "";
      log.handleAddMeal({
        id,
        time,
        mealType: (meal.type || "snack") as Meal["mealType"],
        label: (meal.type ? typeLabels[meal.type] : undefined) || "Прийом їжі",
        name: meal.name || "Страва",
        macros: {
          kcal: meal.kcal ?? null,
          protein_g: meal.protein_g ?? null,
          fat_g: meal.fat_g ?? null,
          carbs_g: meal.carbs_g ?? null,
        },
        source: "manual",
        macroSource: "recipeAI",
      });
    },
    [log],
  );

  // ─── Shopping list ──────────────────────────────────────────────────────
  interface ShoppingRequestBody {
    pantryItems: PantryItem[];
    locale: string;
    weekPlan?: UiNutritionWeekPlan;
    recipes?: UiNutritionRecipe[];
  }
  const shoppingMutation = useMutation({
    mutationFn: (source: string) => {
      const body: ShoppingRequestBody = {
        pantryItems: pantry.effectiveItems.slice(0, 50),
        locale: "uk-UA",
      };
      const weekPlanDays = Array.isArray(weekPlan?.days) ? weekPlan.days : [];
      if (source === "weekplan" && weekPlan && weekPlanDays.length > 0) {
        body.weekPlan = weekPlan;
      } else if (recipes.length > 0) {
        body.recipes = recipes;
      } else {
        throw new Error("Немає рецептів чи тижневого плану для генерації.");
      }
      return nutritionApi.shoppingList(body).then((data) => {
        if (!Array.isArray(data?.categories))
          throw new Error("Не вдалося згенерувати список покупок.");
        const categories = adaptShoppingCategories(data.categories).filter(
          (category) => category.items.length > 0,
        );
        if (categories.length === 0) {
          throw new Error(
            "AI не повернув жодної покупки. Перевір джерело списку або склад комори й спробуй ще раз.",
          );
        }
        return categories;
      });
    },
    onMutate: () => {
      setShoppingBusy(true);
      setErr("");
    },
    onSuccess: (categories) => {
      shopping.setGeneratedList(categories);
      hapticSuccess();
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Помилка генерації списку покупок"));
    },
    onSettled: () => {
      setShoppingBusy(false);
    },
  });

  const generateShoppingList = useCallback(
    (source: string) => shoppingMutation.mutate(source),
    [shoppingMutation],
  );

  return {
    recommendRecipes,
    fetchWeekPlan,
    fetchDayPlan,
    addMealFromPlan,
    generateShoppingList,
  };
}
