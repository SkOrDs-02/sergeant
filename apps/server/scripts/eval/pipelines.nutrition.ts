/**
 * Пайплайни нутриційних AI-шляхів: `day-plan`, `week-plan`,
 * `shopping-list`, `recommend-recipes`, `parse-pantry`.
 *
 * Судді тут переважно СТРУКТУРНІ, і це не випадковість: усі ці ендпоінти
 * повертають JSON, який прод одразу проганяє через нормалізатор. «Модель
 * відповіла погано» тут має обʼєктивне значення — прод віддав би клієнту
 * порожній масив і `rawText`, тобто екран без даних.
 */

import { env } from "../../src/env/env.js";
import {
  buildDayPlanPrompt,
  type DayPlanInput,
} from "../../src/modules/nutrition/day-plan.js";
import {
  buildWeekPlanPrompt,
  type WeekPlanInput,
} from "../../src/modules/nutrition/week-plan.js";
import {
  buildShoppingListPrompt,
  type ShoppingListInput,
} from "../../src/modules/nutrition/shopping-list.js";
import {
  buildRecommendRecipesPrompt,
  type RecommendRecipesInput,
} from "../../src/modules/nutrition/recommend-recipes.js";
import { buildParsePantryPrompt } from "../../src/modules/nutrition/parse-pantry.js";
import { asRecord, normalizeName, pantryItems, recipes } from "./judges.js";
import type { JudgeVerdict, Pipeline } from "./types.js";

/**
 * Спільний СПИСОК, не спільний МАСИВ — кожен пайплайн бере копію
 * (`candidates: [...nutritionCandidates]`).
 *
 * AI-DANGER: `--extra` робить `pipeline.candidates.push(...)`. Поки всі шість
 * пайплайнів вказували на один інстанс масиву, шість прапорців `--extra`
 * (по одному на пайплайн) додавали шість копій КОЖНОГО кандидата в КОЖЕН
 * пайплайн — прогін вийшов у 6 разів довший і дорожчий, а таблиця показала
 * 204 запуски там, де мало бути 34. Не згортай копію назад у посилання.
 */
const nutritionCandidates = [
  {
    provider: "anthropic" as const,
    model: env.NUTRITION_MODEL,
    label: "current default (Anthropic)",
  },
  {
    provider: "openrouter" as const,
    model: "google/gemini-2.5-flash-lite",
    label: "OpenRouter Gemini Flash Lite",
  },
];

const PANTRY = [
  { name: "куряче філе", qty: 600, unit: "г" },
  { name: "рис", qty: 1, unit: "кг" },
  { name: "яйця", qty: 10, unit: "шт" },
  { name: "морква", qty: 4, unit: "шт" },
  { name: "олія соняшникова", qty: 1, unit: "л" },
];

/**
 * Основа слова для звірки інгредієнта з коморою.
 *
 * AI-DANGER: без відкидання закінчення суддя валить ПРАВИЛЬНУ відповідь.
 * У коморі «яйця», модель написала «яйце - 1 шт» — і `includes("яйця")` дав
 * промах, хоча це той самий продукт. Так само «морква» проти «моркву».
 * Відкидаємо один символ лише зі слів довших за 4 літери: «рис» → «ри» вже
 * ловив би «рисова паста» й будь-яке слово на «ри».
 */
function pantryStem(pantryName: string): string {
  const first = pantryName.split(" ")[0] ?? pantryName;
  return first.length > 4 ? first.slice(0, -1) : first;
}

/** Базові допущення, які промпти явно дозволяють додавати понад комору. */
const ALLOWED_EXTRAS =
  /сіл|перц|перець|вод|оли|олі|спец|приправ|цукор|оцет|лавров/i;

// ── day-plan ────────────────────────────────────────────────────────

const dayPlan = (
  name: string,
  trap: string,
  input: DayPlanInput,
  judge: (text: string) => JudgeVerdict,
) => {
  const prompt = buildDayPlanPrompt(input);
  return { name, trap, user: prompt.user, system: prompt.system, judge };
};

interface PlanMealLike {
  type?: unknown;
  kcal?: unknown;
}

const planMeals = (text: string): PlanMealLike[] => {
  const rec = asRecord(text);
  return Array.isArray(rec?.["meals"]) ? (rec["meals"] as PlanMealLike[]) : [];
};

const DAY_PLAN_BASE: DayPlanInput = {
  pantry: PANTRY,
  targets: { kcal: 1800, protein_g: 130, fat_g: 60, carbs_g: 180 },
  locale: "uk-UA",
};

const dayPlanPipeline: Pipeline = {
  key: "day-plan",
  label: "Nutrition day-plan",
  system: buildDayPlanPrompt(DAY_PLAN_BASE).system,
  promptOrigin: "modules/nutrition/day-plan.ts::buildDayPlanPrompt",
  maxTokens: 1500,
  judge: (text) => planMeals(text).length > 0,
  cases: [
    dayPlan(
      "план під цілі",
      "НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.",
      DAY_PLAN_BASE,
      (text) => {
        const meals = planMeals(text);
        if (meals.length < 3) return `страв ${meals.length}, треба ≥3`;
        const total = meals.reduce((sum, m) => sum + (Number(m.kcal) || 0), 0);
        if (total === 0) return "жодна страва не має kcal";
        return (
          Math.abs(total - 1800) / 1800 <= 0.15 ||
          `сума ${total} ккал проти цілі 1800`
        );
      },
    ),
    dayPlan(
      "перегенерувати один прийом",
      "НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.",
      { ...DAY_PLAN_BASE, regenerateMealType: "dinner" },
      (text) => {
        const meals = planMeals(text);
        if (meals.length === 0) return "порожній meals";
        const extra = meals.filter((m) => m.type !== "dinner");
        return (
          extra.length === 0 ||
          `зайві прийоми: ${extra.map((m) => m.type).join(", ")}`
        );
      },
    ),
    dayPlan(
      "порожня комора",
      "НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.",
      { locale: "uk-UA" },
      (text) => {
        const meals = planMeals(text);
        return (
          meals.length >= 3 || `страв ${meals.length} — відмовився планувати`
        );
      },
    ),
  ],
  candidates: [...nutritionCandidates],
};

// ── week-plan ───────────────────────────────────────────────────────

const WEEK_PLAN_BASE: WeekPlanInput = {
  pantry: PANTRY,
  preferences: { goal: "набір мʼязової маси" },
  locale: "uk-UA",
};

const weekDays = (text: string): unknown[] => {
  const rec = asRecord(text);
  return Array.isArray(rec?.["days"]) ? (rec["days"] as unknown[]) : [];
};

const weekPlanPipeline: Pipeline = {
  key: "week-plan",
  label: "Nutrition week-plan",
  system: buildWeekPlanPrompt(WEEK_PLAN_BASE).system,
  promptOrigin: "modules/nutrition/week-plan.ts::buildWeekPlanPrompt",
  maxTokens: 2000,
  judge: (text) => weekDays(text).length > 0,
  cases: [
    {
      name: "тиждень із комори",
      trap: "НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.",
      user: buildWeekPlanPrompt(WEEK_PLAN_BASE).user,
      judge: (text) => {
        const rec = asRecord(text);
        const days = Array.isArray(rec?.["days"]) ? rec["days"] : [];
        if (days.length === 0) return "порожній days";
        if (days.length > 7) return `днів ${days.length}, буде обрізано до 7`;
        const stray = rec?.["shoppingList"] ?? rec?.["shopping_list"];
        return stray == null || "віддав shoppingList — прод його викине";
      },
    },
    {
      name: "комора порожня",
      trap: "НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.",
      user: buildWeekPlanPrompt({ locale: "uk-UA" }).user,
      judge: (text) => {
        const days = weekDays(text);
        return days.length >= 5 || `днів ${days.length} — відмовився планувати`;
      },
    },
  ],
  candidates: [...nutritionCandidates],
};

// ── shopping-list ───────────────────────────────────────────────────

const SHOPPING_BASE: ShoppingListInput = {
  recipes: [
    {
      title: "Курка з рисом",
      ingredients: ["куряче філе 400 г", "рис 200 г", "морква 1 шт", "сіль"],
    },
    {
      title: "Омлет із морквою",
      ingredients: ["яйця 4 шт", "морква 1 шт", "молоко 100 мл", "олія"],
    },
    {
      title: "Рисова каша",
      ingredients: ["рис 150 г", "молоко 300 мл", "цукор"],
    },
  ],
  pantryItems: PANTRY,
  locale: "uk-UA",
};

interface ShoppingItemLike {
  name?: unknown;
}
interface ShoppingCategoryLike {
  items?: unknown;
}

const shoppingNames = (text: string): string[] => {
  const rec = asRecord(text);
  const cats = Array.isArray(rec?.["categories"])
    ? (rec["categories"] as ShoppingCategoryLike[])
    : [];
  return cats.flatMap((c) =>
    (Array.isArray(c.items) ? (c.items as ShoppingItemLike[]) : [])
      .map((i) => (typeof i.name === "string" ? normalizeName(i.name) : ""))
      .filter(Boolean),
  );
};

const shoppingListPipeline: Pipeline = {
  key: "shopping-list",
  label: "Nutrition shopping-list",
  system: buildShoppingListPrompt(SHOPPING_BASE).system,
  promptOrigin: "modules/nutrition/shopping-list.ts::buildShoppingListPrompt",
  maxTokens: 1200,
  judge: (text) => shoppingNames(text).length > 0,
  cases: [
    {
      name: "виключити наявне в коморі",
      trap: "НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.",
      user: buildShoppingListPrompt(SHOPPING_BASE).user,
      judge: (text) => {
        const names = shoppingNames(text);
        if (names.length === 0) return "порожній список";
        const inPantry = ["рис", "яйц", "морк", "куряче філе", "олі"];
        const dup = names.filter((n) => inPantry.some((p) => n.includes(p)));
        return dup.length === 0 || `вже в коморі: ${dup.join(", ")}`;
      },
    },
    {
      name: "дублікат між рецептами",
      trap: "НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає обʼєднати в один із підсумованою кількістю.",
      user: buildShoppingListPrompt(SHOPPING_BASE).user,
      judge: (text) => {
        const milk = shoppingNames(text).filter((n) => n.includes("молок"));
        return (
          milk.length === 1 ||
          `молоко ${milk.length} раз(и): ${milk.join(" | ")}`
        );
      },
    },
    {
      name: "усе вже є вдома",
      trap: "НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.",
      user: buildShoppingListPrompt({
        recipes: [{ title: "Варені яйця", ingredients: ["яйця 3 шт", "сіль"] }],
        pantryItems: PANTRY,
        locale: "uk-UA",
      }).user,
      judge: (text) => {
        const rec = asRecord(text);
        if (rec === null || !Array.isArray(rec["categories"])) {
          return "нема поля categories";
        }
        const names = shoppingNames(text);
        return names.length === 0 || `вигадано: ${names.join(", ")}`;
      },
    },
  ],
  candidates: [...nutritionCandidates],
};

// ── recommend-recipes ───────────────────────────────────────────────

const RECIPES_BASE: RecommendRecipesInput = {
  pantry: PANTRY,
  preferences: {
    goal: "набір мʼязової маси",
    servings: 2,
    timeMinutes: 30,
    exclude: "гриби",
    mealType: "dinner",
    pantryMode: "only",
    locale: "uk-UA",
  },
  locale: "uk-UA",
};

const recipesPipeline: Pipeline = {
  key: "recommend-recipes",
  label: "Nutrition recommend-recipes",
  system: buildRecommendRecipesPrompt(RECIPES_BASE).system,
  promptOrigin:
    "modules/nutrition/recommend-recipes.ts::buildRecommendRecipesPrompt",
  maxTokens: 2800,
  judge: (text) => recipes(text).length >= 2,
  cases: [
    {
      name: "pantryMode=only",
      trap: "НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.",
      user: buildRecommendRecipesPrompt(RECIPES_BASE).user,
      judge: (text) => {
        const list = recipes(text);
        if (list.length < 2) return `рецептів ${list.length}, треба ≥2`;
        const pantryNames = PANTRY.map((p) => normalizeName(p.name));
        const outside = list.flatMap((r) =>
          r.ingredients.filter((ing) => {
            const n = normalizeName(ing);
            return !(
              ALLOWED_EXTRAS.test(n) ||
              pantryNames.some((p) => n.includes(pantryStem(p)))
            );
          }),
        );
        return outside.length === 0 || `поза коморою: ${outside.join(", ")}`;
      },
    },
    {
      name: "алерген у виключеннях",
      trap: "НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.",
      user: buildRecommendRecipesPrompt({
        ...RECIPES_BASE,
        pantry: [...PANTRY, { name: "арахісова паста", qty: 1, unit: "уп" }],
        preferences: {
          ...RECIPES_BASE.preferences,
          exclude: "арахіс, арахісова паста",
          pantryMode: "prefer",
        },
      }).user,
      judge: (text) => {
        const list = recipes(text);
        if (list.length < 2) return `рецептів ${list.length}, треба ≥2`;
        const hit = list.find((r) =>
          [...r.ingredients, r.title, ...r.steps].some((s) =>
            /арахіс/i.test(String(s)),
          ),
        );
        return hit === undefined || `арахіс у рецепті «${hit.title}»`;
      },
    },
    {
      name: "обрізана відповідь",
      trap: "НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.",
      user: buildRecommendRecipesPrompt({
        ...RECIPES_BASE,
        preferences: { ...RECIPES_BASE.preferences, servings: 6 },
      }).user,
      judge: (text) => {
        const list = recipes(text);
        return (
          list.length >= 2 ||
          `рецептів ${list.length} — відповідь обірвалась на ліміті токенів`
        );
      },
    },
  ],
  candidates: [...nutritionCandidates],
};

// ── parse-pantry ────────────────────────────────────────────────────

const PANTRY_RAW = `молоко 1 л
дві банани
куряче філе 600 г
молоко
йогурт
рис 1 кг
йогурт 2`;

const parsePantryPipeline: Pipeline = {
  key: "parse-pantry",
  label: "Nutrition parse-pantry",
  system: buildParsePantryPrompt({ text: PANTRY_RAW, locale: "uk-UA" }).system,
  promptOrigin: "modules/nutrition/parse-pantry.ts::buildParsePantryPrompt",
  maxTokens: 500,
  judge: (text) => pantryItems(text).length > 0,
  cases: [
    {
      name: "дублікати й одиниці",
      trap: "НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає обʼєднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.",
      user: buildParsePantryPrompt({ text: PANTRY_RAW, locale: "uk-UA" }).user,
      judge: (text) => {
        const items = pantryItems(text);
        if (items.length === 0) return "порожній items";
        const names = items.map((i) => normalizeName(i.name));
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length) return `дублікати: ${[...new Set(dupes)].join(", ")}`;
        const banana = items.find((i) => /банан/i.test(i.name));
        if (banana == null) return "банани загубились";
        return banana.unit === "шт" || `банани unit=${banana.unit ?? "null"}`;
      },
    },
    {
      name: "надиктований текст з помилками",
      trap: "НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.",
      user: buildParsePantryPrompt({
        text: "памідори три штуки, агуркі, картопля пять кіло, хліб",
        locale: "uk-UA",
      }).user,
      judge: (text) => {
        const items = pantryItems(text);
        if (items.length < 3) return `позицій ${items.length}, треба ≥3`;
        const missing = [
          items.some((i) => /помідор/i.test(i.name)) ? null : "помідор",
          items.some((i) => /огірок|огірк/i.test(i.name)) ? null : "огірок",
        ].filter((v): v is string => v !== null);
        return (
          missing.length === 0 || `не нормалізовано: ${missing.join(", ")}`
        );
      },
    },
    {
      name: "порожній сенс",
      trap: "НЕПРАВИЛЬНО: вигадати продукти з тексту, де їх немає. Чесна відповідь — порожній або майже порожній `items`, а не «хліб, молоко, яйця» з повітря.",
      user: buildParsePantryPrompt({
        text: "не забути записатися до стоматолога",
        locale: "uk-UA",
      }).user,
      judge: (text) => {
        const items = pantryItems(text);
        return (
          items.length === 0 ||
          `вигадано: ${items.map((i) => i.name).join(", ")}`
        );
      },
    },
  ],
  candidates: [...nutritionCandidates],
};

export const NUTRITION_PIPELINES: Pipeline[] = [
  dayPlanPipeline,
  weekPlanPipeline,
  shoppingListPipeline,
  recipesPipeline,
  parsePantryPipeline,
];

/** Зразки — реекспорт для тесту паритету промптів. */
export const NUTRITION_FIXTURES = {
  pantry: PANTRY,
  dayPlanBase: DAY_PLAN_BASE,
  weekPlanBase: WEEK_PLAN_BASE,
  shoppingBase: SHOPPING_BASE,
  recipesBase: RECIPES_BASE,
  pantryRaw: PANTRY_RAW,
};
