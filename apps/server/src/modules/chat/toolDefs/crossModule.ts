import type { AnthropicTool } from "./types.js";

export const CROSS_MODULE_TOOLS: AnthropicTool[] = [
  {
    name: "morning_briefing",
    description:
      "Ранковий брифінг по всіх модулях: заплановані тренування, звички на сьогодні, бюджет, калорії. Відповідає структурованим текстом.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "weekly_summary",
    description:
      "Тижневий підсумок по всіх модулях: фінанси, тренування, звички, харчування. Повертає текстовий звіт.",
    input_schema: {
      type: "object",
      properties: {
        include_recommendations: {
          type: "boolean",
          description:
            "Чи додавати рекомендації на наступний тиждень (default true)",
        },
      },
    },
  },
  {
    name: "set_goal",
    description:
      "Встановити комплексну ціль через модулі. Наприклад: 'Хочу схуднути на 5 кг' — ШІ автоматично ставить цілі по калоріях + тренуваннях + відстежуванню ваги.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Опис цілі вільним текстом",
        },
        target_weight_kg: {
          type: "number",
          description: "Цільова вага кг (опційно)",
        },
        target_date: {
          type: "string",
          description: "Дедлайн YYYY-MM-DD (опційно)",
        },
        daily_kcal: {
          type: "number",
          description:
            "Калорійна ціль/день (опційно, ШІ порахує якщо не вказано)",
        },
        workouts_per_week: {
          type: "number",
          description: "Тренувань на тиждень (опційно)",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "spending_trend",
    description:
      "Показати тренд витрат за період і порівняти з попереднім аналогічним періодом. Наприклад: 'який тренд витрат за місяць?'",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "Період аналізу в днях (default 30)",
        },
      },
    },
  },
  {
    name: "weight_chart",
    description:
      "Показати дані ваги за період у текстовому/табличному форматі для аналізу трендів.",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "Період в днях (default 30)",
        },
      },
    },
  },
  {
    name: "category_breakdown",
    description:
      "Розбивка витрат по категоріях за період. Показує суму і відсоток для кожної категорії.",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "Період в днях (default 30)",
        },
      },
    },
  },
  {
    name: "get_daily_series",
    description:
      "Вирівняні по днях ряди метрик з різних модулів + пораховані кодом кореляції (Pearson/Spearman) для кожної пари. ГОЛОВНИЙ інструмент для 'чи пов'язано / чи корелює / чи залежить X від Y' по БУДЬ-ЯКІЙ парі метрик, коли в парі НЕ звичка: 'чи пов'язані мої витрати з тренуваннями?', 'чи менше витрачаю коли тренуюсь?', 'вага корелює з калоріями?', 'більше білка — більший об'єм?'. Обери 1-6 метрик; кореляції рахуються на днях, де обидві метрики мають дані. (Якщо в парі є звичка — habit_correlation.)",
    input_schema: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "spending",
              "income",
              "kcal",
              "protein",
              "water",
              "workout_volume",
              "workouts",
              "weight",
              "wellbeing",
              "habit_rate",
            ],
          },
          description:
            "1-6 метрик. finyk: spending/income (грн). nutrition: kcal, protein (г), water (мл). fizruk: workout_volume (кг×повт), workouts (шт/день), weight (кг), wellbeing (настрій 1-5). routine: habit_rate (% виконаних звичок/день).",
        },
        habit_id: {
          type: "string",
          description:
            "Опційно — для habit_rate конкретної звички (100/0 по днях). Без нього — % по всіх активних звичках.",
        },
        date_from: {
          type: "string",
          description: "Початок діапазону YYYY-MM-DD (опційно).",
        },
        date_to: {
          type: "string",
          description:
            "Кінець діапазону YYYY-MM-DD (опційно, default сьогодні).",
        },
        fill: {
          type: "string",
          enum: ["zero", "null"],
          description:
            "Чим заповнювати дні без запису у таблиці: zero (0) або null (порожньо). Default zero. На кореляції не впливає — вони рахуються лише на спільних непорожніх днях.",
        },
      },
      required: ["metrics"],
    },
  },
  {
    name: "detect_anomalies",
    description:
      "Виявити аномальні витрати — транзакції, які значно відрізняються від середнього. 'Чи є підозрілі витрати?'",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "Період аналізу в днях (default 30)",
        },
        threshold_multiplier: {
          type: "number",
          description:
            "Множник від середнього для визначення аномалії (default 3)",
        },
      },
    },
  },
  {
    name: "habit_trend",
    description:
      "Тренд виконання звичок за період: тижневий breakdown, чи покращується дисципліна.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: {
          type: "string",
          description: "ID звички (опційно — якщо не вказано, по всіх)",
        },
        period_days: {
          type: "number",
          description: "Період в днях (default 30)",
        },
      },
    },
  },
  {
    name: "compare_weeks",
    description:
      "Порівняти два тижні по всіх модулях: витрати, вага, виконання звичок, калорії. Викликай коли користувач каже 'порівняй цей тиждень з минулим' або 'як я провів тиждень порівняно з попереднім'.",
    input_schema: {
      type: "object",
      properties: {
        week_a: {
          type: "string",
          description:
            "Тиждень A як YYYY-Www (наприклад 2026-W17). Default — поточний.",
        },
        week_b: {
          type: "string",
          description: "Тиждень B як YYYY-Www. Default — попередній.",
        },
        modules: {
          type: "array",
          items: {
            type: "string",
            enum: ["finyk", "fizruk", "routine", "nutrition"],
          },
          description: "Які модулі включити (default — всі 4).",
        },
      },
    },
  },
];
