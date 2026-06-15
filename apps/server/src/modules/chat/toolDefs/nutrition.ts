import type { AnthropicTool } from "./types.js";

export const NUTRITION_TOOLS: AnthropicTool[] = [
  {
    name: "log_water",
    description:
      "Додати випиту воду в журнал Харчування. Використовуй коли користувач каже 'я випив X мл/склянку води'. Одна склянка ≈ 250 мл.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        amount_ml: {
          type: "number",
          description: "Кількість випитої води в мілілітрах (напр. 250, 500)",
        },
        date: {
          type: "string",
          description: "Дата YYYY-MM-DD (опційно, за замовчуванням — сьогодні)",
        },
      },
      required: ["amount_ml"],
    },
  },
  {
    name: "log_meal",
    description:
      "Записати прийом їжі в щоденник харчування на сьогодні. Використовуй коли користувач каже що з'їв щось і хоче записати.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Назва страви або продукту",
        },
        kcal: {
          type: "number",
          description: "Калорії (ккал)",
        },
        protein_g: {
          type: "number",
          description: "Білок в грамах (опційно)",
        },
        fat_g: {
          type: "number",
          description: "Жири в грамах (опційно)",
        },
        carbs_g: {
          type: "number",
          description: "Вуглеводи в грамах (опційно)",
        },
      },
      required: ["name", "kcal"],
    },
  },
  {
    name: "add_recipe",
    description:
      "Зберегти рецепт у книгу рецептів (IndexedDB). Напр. коли користувач каже 'збережи рецепт омлету з …'. Збереження асинхронне, повідомлення повертається одразу.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Назва рецепту" },
        ingredients: {
          type: "array",
          description: "Список інгредієнтів (рядки)",
          items: { type: "string" },
        },
        steps: {
          type: "array",
          description: "Кроки приготування (рядки)",
          items: { type: "string" },
        },
        servings: { type: "number", description: "Порцій" },
        time_minutes: { type: "number", description: "Час готування хв" },
        kcal: { type: "number", description: "Ккал на порцію (опційно)" },
        protein_g: { type: "number", description: "Білок г (опційно)" },
        fat_g: { type: "number", description: "Жири г (опційно)" },
        carbs_g: { type: "number", description: "Вуглеводи г (опційно)" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_to_shopping_list",
    description:
      "Додати продукт у список покупок. Якщо такий вже є у відповідній категорії — оновлює кількість/нотатку (ідемпотентно по імені).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва продукту" },
        quantity: {
          type: "string",
          description: "Кількість (напр. '500 г', '2 шт')",
        },
        note: { type: "string", description: "Нотатка (опційно)" },
        category: {
          type: "string",
          description: "Категорія списку (опційно, default 'Інше')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "consume_from_pantry",
    description:
      "Видалити / спожити продукт з активної комори (pantry). Ідемпотентно: якщо продукту немає — повертає відповідне повідомлення.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва продукту" },
      },
      required: ["name"],
    },
  },
  {
    name: "set_daily_plan",
    description:
      "Задати/оновити щоденні цілі Харчування: ккал, білок, жири, вуглеводи, ціль по воді (мл). Можна передавати лише ті поля, які змінюються.",
    input_schema: {
      type: "object",
      properties: {
        kcal: { type: "number", description: "Ціль ккал/день" },
        protein_g: { type: "number", description: "Ціль білка г/день" },
        fat_g: { type: "number", description: "Ціль жирів г/день" },
        carbs_g: { type: "number", description: "Ціль вуглеводів г/день" },
        water_ml: { type: "number", description: "Ціль води мл/день" },
      },
    },
  },
  {
    name: "suggest_meal",
    description:
      "Порадити їжу на основі того що залишилось від денної цілі по макронутрієнтах. Наприклад: 'Що з'їсти щоб добити білок?'",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          description:
            "На що зробити акцент: 'protein', 'low_carb', 'balanced', 'low_cal' (опційно)",
        },
        meal_type: {
          type: "string",
          description:
            "Тип прийому: 'breakfast', 'lunch', 'dinner', 'snack' (опційно)",
        },
      },
    },
  },
  {
    name: "copy_meal_from_date",
    description: "Скопіювати прийом їжі з іншого дня на сьогодні.",
    input_schema: {
      type: "object",
      properties: {
        source_date: {
          type: "string",
          description: "Дата-джерело YYYY-MM-DD",
        },
        meal_index: {
          type: "number",
          description:
            "Індекс прийому їжі за той день (0 = перший). Якщо не вказано — копіює всі.",
        },
      },
      required: ["source_date"],
    },
  },
  {
    name: "plan_meals_for_day",
    description:
      "Попросити ШІ спланувати всі прийоми їжі на день під калорійну ціль. Відповідає текстом-планом, використай log_meal для запису кожного.",
    input_schema: {
      type: "object",
      properties: {
        target_kcal: {
          type: "number",
          description:
            "Цільові калорії на день (опційно, береться з щоденного плану)",
        },
        meals_count: {
          type: "number",
          description: "Кількість прийомів їжі (default 3)",
        },
        preferences: {
          type: "string",
          description:
            "Побажання: 'high_protein', 'vegetarian', 'low_carb' тощо (опційно)",
        },
      },
    },
  },
];
