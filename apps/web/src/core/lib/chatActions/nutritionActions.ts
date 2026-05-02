import { ls, lsSet } from "../hubChatUtils";
import { saveRecipeToBook } from "../../../modules/nutrition/lib/recipeBook";
import type {
  LogMealAction,
  LogWaterAction,
  AddRecipeAction,
  AddToShoppingListAction,
  ConsumeFromPantryAction,
  SetDailyPlanAction,
  LogWeightAction,
  SuggestMealAction,
  CopyMealFromDateAction,
  PlanMealsForDayAction,
  NutritionMeal,
  NutritionDay,
  ChatAction,
  ChatActionResult,
} from "./types";

export function handleNutritionAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "log_meal": {
      const { name, kcal, protein_g, fat_g, carbs_g } = (
        action as LogMealAction
      ).input;
      const nutritionLog = ls<Record<string, NutritionDay>>(
        "nutrition_log_v1",
        {},
      );
      const now = new Date();
      const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const dayData: NutritionDay = {
        ...(nutritionLog[todayKey] || { meals: [] }),
      };
      const meals: NutritionMeal[] = Array.isArray(dayData.meals)
        ? dayData.meals.slice()
        : [];
      const mealId = `m_${Date.now()}`;
      meals.push({
        id: mealId,
        name: name || "Без назви",
        macros: {
          kcal: Number(kcal) || 0,
          protein_g: Number(protein_g) || 0,
          fat_g: Number(fat_g) || 0,
          carbs_g: Number(carbs_g) || 0,
        },
        addedAt: new Date().toISOString(),
      });
      nutritionLog[todayKey] = { ...dayData, meals };
      lsSet("nutrition_log_v1", nutritionLog);
      const result = `Прийом їжі "${name || "Без назви"}" записано: ${Math.round(Number(kcal) || 0)} ккал`;
      return {
        result,
        undo: () => {
          const cur = ls<Record<string, NutritionDay>>("nutrition_log_v1", {});
          const day = cur[todayKey];
          if (!day || !Array.isArray(day.meals)) return;
          const next = day.meals.filter((m) => m.id !== mealId);
          if (next.length === day.meals.length) return;
          if (next.length === 0) {
            const { [todayKey]: _removed, ...rest } = cur;
            void _removed;
            lsSet("nutrition_log_v1", rest);
          } else {
            lsSet("nutrition_log_v1", {
              ...cur,
              [todayKey]: { ...day, meals: next },
            });
          }
        },
      };
    }
    case "log_water": {
      const { amount_ml, date: waterDate } = (action as LogWaterAction).input;
      const ml = Math.floor(Number(amount_ml));
      if (!Number.isFinite(ml) || ml <= 0) {
        return "Некоректна кількість води.";
      }
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const dateKey =
        waterDate && /^\d{4}-\d{2}-\d{2}$/.test(waterDate) ? waterDate : today;
      const log = ls<Record<string, number>>("nutrition_water_v1", {});
      const prev = Number(log[dateKey]) || 0;
      log[dateKey] = prev + ml;
      lsSet("nutrition_water_v1", log);
      return {
        result: `Додано ${ml} мл води (разом за ${dateKey}: ${log[dateKey]} мл)`,
        // Undo віднімає рівно свої ml від поточного значення, а не
        // відновлює prev — інакше паралельні +log_water між додаванням
        // і undo втратилися б. Якщо після віднімання лишился 0 — чистимо key.
        undo: () => {
          const cur = ls<Record<string, number>>("nutrition_water_v1", {});
          const cv = Number(cur[dateKey]) || 0;
          const after = cv - ml;
          if (after <= 0) {
            const { [dateKey]: _removed, ...rest } = cur;
            void _removed;
            lsSet("nutrition_water_v1", rest);
          } else {
            lsSet("nutrition_water_v1", { ...cur, [dateKey]: after });
          }
        },
      };
    }
    case "add_recipe": {
      const {
        title,
        ingredients,
        steps,
        servings,
        time_minutes,
        kcal,
        protein_g,
        fat_g,
        carbs_g,
      } = (action as AddRecipeAction).input;
      const t = (title || "").trim();
      if (!t) return "Потрібна назва рецепту.";
      const payload = {
        title: t,
        servings:
          servings != null && Number.isFinite(Number(servings))
            ? Number(servings)
            : null,
        timeMinutes:
          time_minutes != null && Number.isFinite(Number(time_minutes))
            ? Number(time_minutes)
            : null,
        ingredients: Array.isArray(ingredients)
          ? ingredients.map((x) => String(x)).filter(Boolean)
          : [],
        steps: Array.isArray(steps)
          ? steps.map((x) => String(x)).filter(Boolean)
          : [],
        tips: [],
        macros: {
          kcal:
            kcal != null && Number.isFinite(Number(kcal)) ? Number(kcal) : null,
          protein_g:
            protein_g != null && Number.isFinite(Number(protein_g))
              ? Number(protein_g)
              : null,
          fat_g:
            fat_g != null && Number.isFinite(Number(fat_g))
              ? Number(fat_g)
              : null,
          carbs_g:
            carbs_g != null && Number.isFinite(Number(carbs_g))
              ? Number(carbs_g)
              : null,
        },
      };
      void saveRecipeToBook(payload).catch((err: unknown) => {
        // fire-and-forget, але повний silent не хочемо — збої збереження
        // рецепту у книгу з чату були невидимі для UX/саппорту.
        console.warn("[hubChat] saveRecipeToBook failed", err);
      });
      return `Рецепт "${t}" збережено в книгу рецептів.`;
    }
    case "add_to_shopping_list": {
      const { name, quantity, note, category } = (
        action as AddToShoppingListAction
      ).input;
      const itemName = (name || "").trim();
      if (!itemName) return "Потрібна назва продукту.";
      const catName = (category && String(category).trim()) || "Інше";
      const list = ls<{
        categories?: Array<{
          name: string;
          items: Array<{
            id: string;
            name: string;
            quantity?: string;
            note?: string;
            checked?: boolean;
          }>;
        }>;
      }>("nutrition_shopping_list_v1", {});
      const categories = Array.isArray(list.categories)
        ? list.categories.slice()
        : [];
      let catIdx = categories.findIndex((c) => c.name === catName);
      if (catIdx < 0) {
        categories.push({ name: catName, items: [] });
        catIdx = categories.length - 1;
      }
      const items = (categories[catIdx].items || []).slice();
      const lower = itemName.toLowerCase();
      const itemIdx = items.findIndex(
        (it) =>
          String(it.name || "")
            .trim()
            .toLowerCase() === lower,
      );
      const qty = (quantity && String(quantity).trim()) || "";
      const notTxt = (note && String(note).trim()) || "";
      let action_msg = "додано";
      let createdId: string | null = null;
      if (itemIdx >= 0) {
        items[itemIdx] = {
          ...items[itemIdx],
          quantity: qty || items[itemIdx].quantity || "",
          note: notTxt || items[itemIdx].note || "",
        };
        action_msg = "оновлено";
      } else {
        createdId = `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        items.push({
          id: createdId,
          name: itemName,
          quantity: qty,
          note: notTxt,
          checked: false,
        });
      }
      categories[catIdx] = { ...categories[catIdx], items };
      lsSet("nutrition_shopping_list_v1", { ...list, categories });
      const result = `Продукт "${itemName}" ${action_msg} у список покупок${qty ? ` (${qty})` : ""} [${catName}]`;
      if (!createdId) {
        // "оновлено" гілка — undo-флоу недоступний без снапшота,
        // який може переписати паралельні редагування. Повертаємо
        // простий string — в follow-up можна додати вручну ("оновлено”
        // рідко буває, більшість турнів в LLM — додають).
        return result;
      }
      const newId = createdId;
      return {
        result,
        undo: () => {
          const cur = ls<{
            categories?: Array<{
              name: string;
              items: Array<{ id: string }>;
            }>;
          }>("nutrition_shopping_list_v1", {});
          const cats = Array.isArray(cur.categories)
            ? cur.categories.slice()
            : [];
          const ci = cats.findIndex((c) => c.name === catName);
          if (ci < 0) return;
          const its = (cats[ci].items || []).filter((it) => it.id !== newId);
          if (its.length === 0) {
            cats.splice(ci, 1);
          } else {
            cats[ci] = { ...cats[ci], items: its };
          }
          lsSet("nutrition_shopping_list_v1", {
            ...cur,
            categories: cats,
          });
        },
      };
    }
    case "consume_from_pantry": {
      const { name } = (action as ConsumeFromPantryAction).input;
      const rawName = (name || "").trim();
      if (!rawName) return "Потрібна назва продукту.";
      const activeId =
        ls<string | null>("nutrition_active_pantry_v1", null) || "home";
      const pantries = ls<
        Array<{
          id: string;
          name: string;
          items: Array<{ name: string }>;
        }>
      >("nutrition_pantries_v1", []);
      const idx = pantries.findIndex((p) => p.id === activeId);
      if (idx < 0) return `Активну комору (${activeId}) не знайдено.`;
      const pantry = pantries[idx];
      const lower = rawName.toLowerCase();
      const items = Array.isArray(pantry.items) ? pantry.items : [];
      const before = items.length;
      const nextItems = items.filter(
        (it) =>
          String(it.name || "")
            .trim()
            .toLowerCase() !== lower,
      );
      if (nextItems.length === before) {
        return `Продукт "${rawName}" у коморі не знайдено.`;
      }
      const next = [...pantries];
      next[idx] = { ...pantry, items: nextItems };
      lsSet("nutrition_pantries_v1", next);
      return `Продукт "${rawName}" прибрано з комори "${pantry.name}"`;
    }
    case "set_daily_plan": {
      const { kcal, protein_g, fat_g, carbs_g, water_ml } = (
        action as SetDailyPlanAction
      ).input;
      const prefs = ls<Record<string, unknown>>("nutrition_prefs_v1", {});
      const next = { ...prefs };
      const parts: string[] = [];
      const setField = (
        key: string,
        val: unknown,
        label: string,
        unit: string,
      ) => {
        const n = Number(val);
        if (val != null && val !== "" && Number.isFinite(n) && n > 0) {
          next[key] = n;
          parts.push(`${label} ${n} ${unit}`);
        }
      };
      setField("dailyTargetKcal", kcal, "ккал", "");
      setField("dailyTargetProtein_g", protein_g, "білок", "г");
      setField("dailyTargetFat_g", fat_g, "жири", "г");
      setField("dailyTargetCarbs_g", carbs_g, "вуглеводи", "г");
      setField("waterGoalMl", water_ml, "вода", "мл");
      if (parts.length === 0) return "Немає полів для оновлення плану.";
      lsSet("nutrition_prefs_v1", next);
      return `Щоденний план оновлено: ${parts.join(", ")}`;
    }
    case "log_weight": {
      const { weight_kg, note } = (action as LogWeightAction).input;
      const n = Number(weight_kg);
      if (!Number.isFinite(n) || n <= 0)
        return "Вага має бути додатним числом (кг).";
      const entry = {
        id: `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        weightKg: n,
        sleepHours: null,
        energyLevel: null,
        moodScore: null,
        note: note ? String(note).trim().slice(0, 500) : "",
      };
      const existing = ls<Array<Record<string, unknown>>>(
        "fizruk_daily_log_v1",
        [],
      );
      lsSet("fizruk_daily_log_v1", [entry, ...existing]);
      return `Вагу записано: ${n} кг`;
    }
    // ── Фізрук v2 ──────────────────────────────────────────────
    case "suggest_meal": {
      const { focus, meal_type } = (action as SuggestMealAction).input || {};
      const nutritionLog = ls<Record<string, NutritionDay>>(
        "nutrition_log_v1",
        {},
      );
      const nutritionPrefs = ls<Record<string, number> | null>(
        "nutrition_prefs_v1",
        null,
      );
      const now = new Date();
      const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const todayData = nutritionLog[todayKey];
      const meals = Array.isArray(todayData?.meals) ? todayData.meals : [];
      const eaten = {
        kcal: meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0),
        protein: meals.reduce((s, m) => s + (m?.macros?.protein_g ?? 0), 0),
        fat: meals.reduce((s, m) => s + (m?.macros?.fat_g ?? 0), 0),
        carbs: meals.reduce((s, m) => s + (m?.macros?.carbs_g ?? 0), 0),
      };
      const target = {
        kcal: nutritionPrefs?.dailyTargetKcal || 2000,
        protein: nutritionPrefs?.dailyTargetProtein_g || 120,
      };
      const remaining = {
        kcal: Math.max(0, target.kcal - eaten.kcal),
        protein: Math.max(0, target.protein - eaten.protein),
      };
      const parts: string[] = [
        `З'їдено сьогодні: ${Math.round(eaten.kcal)} ккал, ${Math.round(eaten.protein)}г білка`,
        `Залишилось: ${Math.round(remaining.kcal)} ккал, ${Math.round(remaining.protein)}г білка`,
      ];
      if (focus) parts.push(`Фокус: ${focus}`);
      if (meal_type) parts.push(`Тип прийому: ${meal_type}`);
      return (
        parts.join(". ") + ". Рекомендацію сформовано на основі цих даних."
      );
    }
    case "copy_meal_from_date": {
      const { source_date, meal_index } = (action as CopyMealFromDateAction)
        .input;
      if (!source_date || !/^\d{4}-\d{2}-\d{2}$/.test(source_date))
        return "Потрібна дата-джерело у форматі YYYY-MM-DD.";
      const nutritionLog = ls<Record<string, NutritionDay>>(
        "nutrition_log_v1",
        {},
      );
      const sourceDay = nutritionLog[source_date];
      if (
        !sourceDay ||
        !Array.isArray(sourceDay.meals) ||
        sourceDay.meals.length === 0
      )
        return `За ${source_date} немає записів їжі.`;
      const now = new Date();
      const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const dayData: NutritionDay = {
        ...(nutritionLog[todayKey] || { meals: [] }),
      };
      const meals: NutritionMeal[] = Array.isArray(dayData.meals)
        ? dayData.meals.slice()
        : [];
      let copied: NutritionMeal[];
      if (meal_index != null && meal_index !== "") {
        const idx = Number(meal_index);
        if (idx < 0 || idx >= sourceDay.meals.length)
          return `Індекс ${idx} поза межами (є ${sourceDay.meals.length} записів).`;
        copied = [sourceDay.meals[idx]];
      } else {
        copied = sourceDay.meals;
      }
      for (const m of copied) {
        meals.push({
          ...m,
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          addedAt: new Date().toISOString(),
        });
      }
      nutritionLog[todayKey] = { ...dayData, meals };
      lsSet("nutrition_log_v1", nutritionLog);
      const totalKcal = copied.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      return `Скопійовано ${copied.length} прийом(ів) з ${source_date} (${Math.round(totalKcal)} ккал)`;
    }
    case "plan_meals_for_day": {
      const { target_kcal, meals_count, preferences } =
        (action as PlanMealsForDayAction).input || {};
      const nutritionPrefs = ls<Record<string, number> | null>(
        "nutrition_prefs_v1",
        null,
      );
      const targetKcal =
        Number(target_kcal) || nutritionPrefs?.dailyTargetKcal || 2000;
      const count = Number(meals_count) || 3;
      const parts: string[] = [
        `Планую ${count} прийомів на ${targetKcal} ккал/день`,
        `Приблизно ${Math.round(targetKcal / count)} ккал на прийом`,
      ];
      if (preferences) parts.push(`Побажання: ${preferences}`);
      if (nutritionPrefs?.dailyTargetProtein_g) {
        parts.push(`Ціль білка: ${nutritionPrefs.dailyTargetProtein_g}г/день`);
      }
      return (
        parts.join(". ") + ". Рекомендацію сформовано на основі цих даних."
      );
    }
    // ── Кросмодульні ───────────────────────────────────────────
    default:
      return undefined;
  }
}
