import type { AnthropicTool } from "./types.js";

/**
 * Read-only "talk to your data" query tools для Рутини (PR3 talk-to-your-data).
 * Лише читають журнал звичок (`hub_routine_v1`) на клієнті й повертають
 * числові відповіді / агрегації / кореляції — без запису. Виконавці живуть у
 * `apps/web/src/core/lib/chatActions/queryRoutineActions.ts`.
 *
 * Навмисно НЕ `strict: true` — Anthropic ліміт 20 strict-tools на запит
 * (див. INCIDENT 2026-05-16 у `tools.ts`).
 */
export const QUERY_ROUTINE_TOOLS: AnthropicTool[] = [
  {
    name: "query_habits",
    description:
      "Детальна статистика виконання звички за період: completion rate, найкращі/найгірші дні тижня, серії та пропуски. Read-only. Для 'в які дні тижня я пропускаю медитацію?'. Приймає назву або id звички.",
    input_schema: {
      type: "object",
      properties: {
        habit: {
          type: "string",
          description:
            "Назва звички (напр. 'медитація') або її id. Без значення — агрегує всі активні звички (опційно)",
        },
        period_days: {
          type: "number",
          description: "За скільки останніх днів, 1-365 (опційно, default 30)",
        },
      },
    },
  },
  {
    name: "habit_correlation",
    description:
      "Кореляція між виконанням КОНКРЕТНОЇ ЗВИЧКИ і метрикою іншого модуля (витрати Фініка або тренування Фізрука) — порівнює дні, коли звичка виконана, з днями, коли ні. Read-only. Використовуй ЛИШЕ коли в питанні фігурує звичка: 'чи частіше медитую в дні тренувань?', 'чи менше витрачаю в дні коли роблю зарядку?'. Для пар БЕЗ звички (витрати↔тренування, вага↔калорії, білок↔об'єм) — get_daily_series.",
    input_schema: {
      type: "object",
      properties: {
        habit: {
          type: "string",
          description:
            "Назва або id звички, виконання якої порівнюємо (опційно; без значення — агрегує всі активні)",
        },
        against: {
          type: "string",
          description:
            "Метрика для порівняння: 'spending' (витрати Фініка) | 'workouts' (тренування Фізрука). Default 'spending'",
        },
        period_days: {
          type: "number",
          description: "За скільки останніх днів, 1-365 (опційно, default 60)",
        },
      },
    },
  },
];
