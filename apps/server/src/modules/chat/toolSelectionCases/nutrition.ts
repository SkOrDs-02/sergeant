/**
 * Кейси вибору інструментів - домен `nutrition`.
 *
 * Заповнюється так, щоб кожен інструмент домену був названий бодай в одному
 * `accept`; повноту стереже `toolCoverage.test.ts`.
 */

import { TURN_REFS_HEADING } from "@sergeant/shared";
import type { HistoryMessage, ToolCase } from "./types.js";

/**
 * Запис їжі через чат і пропозиція списати з комори (рішення власника
 * 2026-11-19, Б: «рядком у відповіді чату», згода наступною реплікою,
 * списання наявним `consume_from_pantry`).
 *
 * AI-CONTEXT: `PANTRY_OFFER_REFS` — дослівно те, що збирає веб: результат
 * `log_meal` (`chatActions/nutritionPantryOffer.ts`, хвіст `(для моделі: …)`)
 * у блоці `[Записи з попередньої відповіді]` (`hub/chat/turnRefs.ts`).
 * Розійдеться формат у вебі — онови і тут. Згода — НАСТУПНЕ повідомлення
 * людини, тож це кейс з `history`, а не з `turns`: між ходами `turns` людина
 * не говорить.
 */
const PANTRY_OFFER_HISTORY: HistoryMessage[] = [
  { role: "user", content: "Зʼїв 150 г вареного рису, десь 195 ккал" },
  {
    role: "assistant",
    content:
      "Записав: рис, 195 ккал. У коморі є рис — списати 150 г із комори?",
  },
];

const PANTRY_OFFER_REFS =
  `\n\n${TURN_REFS_HEADING}\n` +
  '- log_meal: Прийом їжі "Рис" записано: 195 ккал (для моделі: у коморі є «Рис», запропонуй людині одним рядком списати 150 г; якщо погодиться, виклич consume_from_pantry з name «Рис» і qty 150)';

export const NUTRITION_CASES: ToolCase[] = [
  {
    name: "випив води",
    user: "Випив склянку води",
    accept: ["log_water"],
  },
  {
    name: "записати обід",
    user: "Зʼїв гречку з куркою, десь 450 ккал, білка грам 35",
    accept: ["log_meal"],
  },
  {
    name: "зберегти рецепт",
    user: "Збережи рецепт: омлет з сиром, яйця і сир, 5 хвилин, 2 порції",
    accept: ["add_recipe"],
  },
  {
    name: "додати в список покупок",
    user: "Додай молоко в список покупок, 1 літр",
    accept: ["add_to_shopping_list"],
  },
  {
    name: "спожив продукт з комори",
    user: "Використав 200 г курячого філе з комори",
    accept: ["consume_from_pantry"],
    // Позиція комори в грамах, тож 200, а не 0.2 кг.
    expectArgs: { consume_from_pantry: { qty: 200 } },
  },
  {
    name: "очистити комору повністю",
    user: "Видали все з комори, там усе прострочене",
    accept: ["clear_pantry"],
  },
  {
    name: "прибрати один продукт з комори",
    user: "Прибери молоко з комори, воно скисло",
    accept: ["consume_from_pantry"],
  },
  {
    name: "задати денну ціль",
    user: "Постав мені ціль 2200 ккал і 150 г білка на день",
    accept: ["set_daily_plan"],
    expectArgs: { set_daily_plan: { kcal: 2200, protein_g: 150 } },
  },
  {
    name: "порадити їжу під ціль",
    user: "Що зʼїсти щоб добити білок сьогодні?",
    accept: ["suggest_meal"],
  },
  {
    // Розвідка перед дією тут правильна, і одноходовий стенд рахував її як
    // промах. `accept` розширений на читання навмисно: строгість не втрачена,
    // бо цільовий `copy_meal_from_date` тепер вимагається останнім ходом.
    name: "скопіювати вчорашню їжу",
    user: "Постав мені на сьогодні те саме, що я їв учора",
    accept: ["copy_meal_from_date", "query_nutrition"],
    turns: [
      {
        result:
          "2026-07-29: сніданок «вівсянка з бананом» 420 ккал; обід «гречка з куркою» 610 ккал; вечеря «салат з тунцем» 300 ккал.",
        accept: ["copy_meal_from_date", "log_meal"],
      },
    ],
  },
  {
    name: "спланувати день харчування",
    user: "Склади мені план харчування на день, 3 прийоми, під мою денну ціль",
    accept: ["plan_meals_for_day"],
  },
  {
    name: "що їв за тиждень",
    user: "Що я їв у понеділок? І скільки разів за тиждень я їв курку?",
    accept: ["query_nutrition"],
  },
  {
    name: "записати їжу з вагою",
    user: "Зʼїв 150 г вареного рису, десь 195 ккал, запиши",
    accept: ["log_meal"],
    expectArgs: { log_meal: { amount_g: 150, kcal: 195 } },
  },
  {
    name: "згода списати з комори після запису",
    history: PANTRY_OFFER_HISTORY,
    dataExtra: PANTRY_OFFER_REFS,
    user: "Так, списуй",
    accept: ["consume_from_pantry"],
    expectArgs: { consume_from_pantry: { name: ["Рис", "рис"], qty: 150 } },
  },
  {
    name: "відмова списати з комори після запису",
    history: PANTRY_OFFER_HISTORY,
    dataExtra: PANTRY_OFFER_REFS,
    user: "Ні, не треба, то був рис з їдальні",
    accept: [],
    expectNoTool: true,
  },
  {
    name: "середня калорійність",
    user: "Яка моя середня калорійність за останній тиждень?",
    accept: ["nutrition_averages"],
  },
];
