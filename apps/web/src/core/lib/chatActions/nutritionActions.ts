import { logger } from "@shared/lib";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { saveRecipeToBook } from "../../../modules/nutrition/lib/recipeBook";
import { mirrorWeightToBiometrics } from "../../profile/biometrics";
import {
  persistFizrukDailyLog,
  readFizrukDailyLog,
} from "./fizrukActions/shared";
// AI-CONTEXT: chat-action executors run outside React, so they must write
// through the module's canonical storage wrappers — NOT raw `lsSet`. After
// Stage 8 (#057n-tombstone) the `nutrition_log/prefs/pantries` LS keys are no
// longer read (SQLite warm-cache is the source of truth); water/shopping still
// dual-write LS+SQLite. Going through these wrappers keeps AI writes visible in
// the module UI and mirrored to SQLite for cross-device sync.
import {
  addLogEntry,
  loadActivePantryId,
  loadNutritionLog,
  loadNutritionPrefs,
  loadPantries,
  persistNutritionLog,
  persistNutritionPrefs,
  persistPantries,
  removeLogEntry,
  type Meal,
} from "../../../modules/nutrition/lib/nutritionStorage";
import {
  loadWaterLog,
  saveWaterLog,
} from "../../../modules/nutrition/lib/waterStorage";
import {
  loadShoppingList,
  persistShoppingList,
} from "../../../modules/nutrition/lib/shoppingListStorage";
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
      const todayKey = getKyivDayKey();
      const mealId = `m_${Date.now()}`;
      // `addLogEntry` runs the entry through `normalizeMeal`, filling the
      // canonical Meal shape (mealType/source/macroSource/…) the chat input
      // omits. `persistNutritionLog` mirrors to SQLite via the dual-write
      // pipeline so the module UI (which reads the warm cache) sees it.
      persistNutritionLog(
        addLogEntry(loadNutritionLog(), todayKey, {
          id: mealId,
          name: name || "Без назви",
          macros: {
            kcal: Number(kcal) || 0,
            protein_g: Number(protein_g) || 0,
            fat_g: Number(fat_g) || 0,
            carbs_g: Number(carbs_g) || 0,
          },
        }),
      );
      const result = `Прийом їжі "${name || "Без назви"}" записано: ${Math.round(Number(kcal) || 0)} ккал`;
      return {
        result,
        // `removeLogEntry` is idempotent (filters by id, drops the day when it
        // empties); a double undo re-persists an unchanged log → diff is a
        // no-op, so this is safe to call twice.
        undo: () => {
          persistNutritionLog(
            removeLogEntry(loadNutritionLog(), todayKey, mealId),
          );
        },
      };
    }
    case "log_water": {
      const { amount_ml, date: waterDate } = (action as LogWaterAction).input;
      const ml = Math.floor(Number(amount_ml));
      if (!Number.isFinite(ml) || ml <= 0) {
        return "Некоректна кількість води.";
      }
      const today = getKyivDayKey();
      const dateKey =
        waterDate && /^\d{4}-\d{2}-\d{2}$/.test(waterDate) ? waterDate : today;
      const log = loadWaterLog();
      const prev = Number(log[dateKey]) || 0;
      const total = prev + ml;
      saveWaterLog({ ...log, [dateKey]: total });
      return {
        result: `Додано ${ml} мл води (разом за ${dateKey}: ${total} мл)`,
        // Undo віднімає рівно свої ml від поточного значення, а не
        // відновлює prev — інакше паралельні +log_water між додаванням
        // і undo втратилися б. Якщо після віднімання лишился 0 — чистимо key.
        undo: () => {
          const cur = loadWaterLog();
          const cv = Number(cur[dateKey]) || 0;
          const after = cv - ml;
          if (after <= 0) {
            const { [dateKey]: _removed, ...rest } = cur;
            void _removed;
            saveWaterLog(rest);
          } else {
            saveWaterLog({ ...cur, [dateKey]: after });
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
        logger.warn("[hubChat] saveRecipeToBook failed", err);
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
      const list = loadShoppingList();
      const categories = list.categories.slice();
      let cat = categories.find((c) => c.name === catName);
      if (!cat) {
        cat = { name: catName, items: [] };
        categories.push(cat);
      }
      const items = cat.items.slice();
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
      const existing = itemIdx >= 0 ? items[itemIdx] : undefined;
      if (existing) {
        items[itemIdx] = {
          ...existing,
          quantity: qty || existing.quantity || "",
          note: notTxt || existing.note || "",
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
      cat.items = items;
      persistShoppingList({ ...list, categories });
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
          const cur = loadShoppingList();
          const cats = cur.categories.slice();
          const ci = cats.findIndex((c) => c.name === catName);
          const cat = ci >= 0 ? cats[ci] : undefined;
          if (!cat) return;
          const its = cat.items.filter((it) => it.id !== newId);
          if (its.length === 0) {
            cats.splice(ci, 1);
          } else {
            cats[ci] = { ...cat, items: its };
          }
          persistShoppingList({ ...cur, categories: cats });
        },
      };
    }
    case "consume_from_pantry": {
      const { name } = (action as ConsumeFromPantryAction).input;
      const rawName = (name || "").trim();
      if (!rawName) return "Потрібна назва продукту.";
      const activeId = loadActivePantryId();
      const pantries = loadPantries();
      const idx = pantries.findIndex((p) => p.id === activeId);
      const pantry = idx >= 0 ? pantries[idx] : undefined;
      if (!pantry) return `Активну комору (${activeId}) не знайдено.`;
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
      persistPantries(undefined, undefined, next, activeId);
      return `Продукт "${rawName}" прибрано з комори "${pantry.name}"`;
    }
    case "set_daily_plan": {
      const { kcal, protein_g, fat_g, carbs_g, water_ml } = (
        action as SetDailyPlanAction
      ).input;
      const next = { ...loadNutritionPrefs() };
      const parts: string[] = [];
      const num = (val: unknown): number | null => {
        const n = Number(val);
        return val != null && val !== "" && Number.isFinite(n) && n > 0
          ? n
          : null;
      };
      const kcalN = num(kcal);
      if (kcalN !== null) {
        next.dailyTargetKcal = kcalN;
        parts.push(`ккал ${kcalN}`);
      }
      const proteinN = num(protein_g);
      if (proteinN !== null) {
        next.dailyTargetProtein_g = proteinN;
        parts.push(`білок ${proteinN} г`);
      }
      const fatN = num(fat_g);
      if (fatN !== null) {
        next.dailyTargetFat_g = fatN;
        parts.push(`жири ${fatN} г`);
      }
      const carbsN = num(carbs_g);
      if (carbsN !== null) {
        next.dailyTargetCarbs_g = carbsN;
        parts.push(`вуглеводи ${carbsN} г`);
      }
      const waterN = num(water_ml);
      if (waterN !== null) {
        next.waterGoalMl = waterN;
        parts.push(`вода ${waterN} мл`);
      }
      if (parts.length === 0) return "Немає полів для оновлення плану.";
      persistNutritionPrefs(next);
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
      // Weight is a Fizruk daily-log entry: persist through the shared helper
      // so it dual-writes to SQLite and mirrors to Profile/Nutrition biometrics.
      persistFizrukDailyLog([entry, ...readFizrukDailyLog()]);
      mirrorWeightToBiometrics(n, entry.at);
      return `Вагу записано: ${n} кг`;
    }
    // ── Фізрук v2 ──────────────────────────────────────────────
    case "suggest_meal": {
      const { focus, meal_type } = (action as SuggestMealAction).input || {};
      const nutritionLog = loadNutritionLog();
      const nutritionPrefs = loadNutritionPrefs();
      const todayKey = getKyivDayKey();
      const todayData = nutritionLog[todayKey];
      const meals = Array.isArray(todayData?.meals) ? todayData.meals : [];
      const eaten = {
        kcal: meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0),
        protein: meals.reduce((s, m) => s + (m?.macros?.protein_g ?? 0), 0),
        fat: meals.reduce((s, m) => s + (m?.macros?.fat_g ?? 0), 0),
        carbs: meals.reduce((s, m) => s + (m?.macros?.carbs_g ?? 0), 0),
      };
      const target = {
        kcal: nutritionPrefs.dailyTargetKcal || 2000,
        protein: nutritionPrefs.dailyTargetProtein_g || 120,
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
      const nutritionLog = loadNutritionLog();
      const sourceDay = nutritionLog[source_date];
      if (
        !sourceDay ||
        !Array.isArray(sourceDay.meals) ||
        sourceDay.meals.length === 0
      )
        return `За ${source_date} немає записів їжі.`;
      const todayKey = getKyivDayKey();
      let copied: Meal[];
      if (meal_index != null && meal_index !== "") {
        const idx = Number(meal_index);
        const meal = sourceDay.meals[idx];
        if (idx < 0 || idx >= sourceDay.meals.length || !meal)
          return `Індекс ${idx} поза межами (є ${sourceDay.meals.length} записів).`;
        copied = [meal];
      } else {
        copied = sourceDay.meals;
      }
      let nextLog = nutritionLog;
      for (const m of copied) {
        nextLog = addLogEntry(nextLog, todayKey, {
          ...m,
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        });
      }
      persistNutritionLog(nextLog);
      const totalKcal = copied.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      return `Скопійовано ${copied.length} прийом(ів) з ${source_date} (${Math.round(totalKcal)} ккал)`;
    }
    case "plan_meals_for_day": {
      const { target_kcal, meals_count, preferences } =
        (action as PlanMealsForDayAction).input || {};
      const nutritionPrefs = loadNutritionPrefs();
      const targetKcal =
        Number(target_kcal) || nutritionPrefs.dailyTargetKcal || 2000;
      const count = Number(meals_count) || 3;
      const parts: string[] = [
        `Планую ${count} прийомів на ${targetKcal} ккал/день`,
        `Приблизно ${Math.round(targetKcal / count)} ккал на прийом`,
      ];
      if (preferences) parts.push(`Побажання: ${preferences}`);
      if (nutritionPrefs.dailyTargetProtein_g) {
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
