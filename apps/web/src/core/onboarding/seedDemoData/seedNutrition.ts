import {
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_WATER_KEY,
} from "./keys";
import { dateKey, daysAgo, shortId, writeJSON } from "./utils";

export function seedNutrition(): void {
  const today = dateKey(new Date());
  const yesterday = dateKey(daysAgo(1));

  const meal = (
    seed: number,
    time: string,
    label: string,
    name: string,
    kcal: number,
    protein: number,
    fat: number,
    carbs: number,
    mealType: "breakfast" | "lunch" | "dinner" | "snack",
    /**
     * Страва, знята з фото: макроси вгадав ШІ.
     *
     * AI-CONTEXT: рівно один такий запис у демо — і це не декор. «Смуга дня»
     * (`components/DayStrip.tsx`) кодує невпевненість ШТРИХУВАННЯМ, і це
     * єдиний канал, якого немає в журналі під нею; `isEstimatedMeal`
     * зараховує тільки `photoAI`. Доки всі демо-страви були `manual`,
     * штрихування не рендерилось жодного разу, тобто новий користувач
     * бачив вид без тієї частини, заради якої вид існує.
     *
     * Чому саме сніданок і чому один. Частка здогадок має лишатись НИЖЧЕ
     * `ESTIMATED_KCAL_SHARE_THRESHOLD` (0.5): вище за нього дашборд і
     * інсайт про білок помʼякшують копію, і демо почало б розповідати про
     * себе «більшість калорій — здогадка». 420 із 1250 ккал дня — це 34%:
     * штрихування добре видно, а тон не зсувається.
     */
    estimatedFromPhoto = false,
  ) => ({
    id: shortId("demo_meal", seed),
    demo: true,
    name,
    time,
    mealType,
    label,
    macros: {
      kcal,
      protein_g: protein,
      fat_g: fat,
      carbs_g: carbs,
    },
    source: estimatedFromPhoto ? ("photo" as const) : ("manual" as const),
    macroSource: estimatedFromPhoto
      ? ("photoAI" as const)
      : ("manual" as const),
    amount_g: null,
    foodId: null,
  });

  const log = {
    [today]: {
      meals: [
        meal(
          1,
          "08:20",
          "Сніданок",
          "Омлет + тост",
          420,
          22,
          18,
          38,
          "breakfast",
          true,
        ),
        meal(
          2,
          "13:15",
          "Обід",
          "Курка з рисом і салатом",
          640,
          42,
          16,
          72,
          "lunch",
        ),
        meal(
          3,
          "16:30",
          "Перекус",
          "Протеїновий батончик",
          190,
          15,
          6,
          18,
          "snack",
        ),
      ],
    },
    [yesterday]: {
      meals: [
        meal(
          4,
          "09:00",
          "Сніданок",
          "Вівсянка з ягодами",
          360,
          12,
          8,
          56,
          "breakfast",
        ),
        meal(
          5,
          "14:00",
          "Обід",
          "Лосось, кіноа, брокколі",
          580,
          38,
          22,
          48,
          "lunch",
        ),
        meal(
          6,
          "19:30",
          "Вечеря",
          "Індичка + овочі",
          490,
          44,
          14,
          28,
          "dinner",
        ),
      ],
    },
  };
  writeJSON(NUTRITION_LOG_KEY, log);

  // Prefs: daily targets so the dashboard progress bars render with
  // a known goal rather than empty rings.
  writeJSON(NUTRITION_PREFS_KEY, {
    goal: "maintain",
    servings: 2,
    timeMinutes: 30,
    exclude: "",
    dailyTargetKcal: 2200,
    dailyTargetProtein_g: 140,
    dailyTargetFat_g: 70,
    dailyTargetCarbs_g: 240,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 9,
    waterGoalMl: 2500,
  });

  // A half-full water log for today — tracker bar shows real progress.
  //
  // AI-DANGER: значення тут — число мілілітрів напряму, БЕЗ обгортки
  // `{ ml: N }`. `WaterLog = Record<string, number>`
  // (`packages/nutrition-domain/src/waterLog.ts`), а `sanitizeMl` робить
  // `Number({ml:1400})` → `NaN` → `0` → ключ відкидається. Обʼєктна форма
  // мовчки гасила воду демо при БУДЬ-ЯКОМУ шляху читання (SQLite чи LS) —
  // виявлено 2026-08-08 разом із поверненням демо-режиму (аудит L-8).
  writeJSON(NUTRITION_WATER_KEY, {
    [today]: 1400,
    [yesterday]: 2200,
  });
}
