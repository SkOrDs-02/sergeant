import type { AnthropicTool } from "./types.js";

/**
 * Read-only "talk to your data" query tools для Фізрука (PR2 talk-to-your-data).
 * Лише читають журнал тренувань (`fizruk_workouts_v1`) на клієнті й повертають
 * числові відповіді / агрегації — без запису. Виконавці живуть у
 * `apps/web/src/core/lib/chatActions/queryFizrukActions.ts`.
 *
 * Навмисно НЕ `strict: true` — Anthropic ліміт 20 strict-tools на запит
 * (див. INCIDENT 2026-05-16 у `tools.ts`).
 */
export const QUERY_FIZRUK_TOOLS: AnthropicTool[] = [
  {
    name: "query_workouts",
    description:
      "Пошук і вибірка завершених тренувань Фізрука за період, з опційним фільтром за вправою або м'язовою групою. Read-only. Для 'покажи мої тренування за останній тиждень'. Повертає кількість, сумарний об'єм і список.",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "За скільки останніх днів, 1-365 (опційно, default 30)",
        },
        exercise: {
          type: "string",
          description: "Фільтр за назвою вправи (опційно)",
        },
        muscle: {
          type: "string",
          description: "Фільтр за м'язовою групою (опційно)",
        },
        limit: {
          type: "number",
          description:
            "Максимум тренувань у списку, 1-50 (опційно, default 15)",
        },
      },
    },
  },
  {
    name: "exercise_progress",
    description:
      "Динаміка прогресу в конкретній вправі (макс. вага, об'єм, повтори) за період у Фізруці. Read-only. Для 'як змінилась моя жим лежачи за місяць?'. Повертає зміну від першої до останньої сесії та найкращі показники.",
    input_schema: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "Назва вправи (напр. 'жим лежачи', 'присідання')",
        },
        period_days: {
          type: "number",
          description: "За скільки останніх днів, 1-365 (опційно, default 90)",
        },
      },
      required: ["exercise_name"],
    },
  },
  {
    name: "training_stats",
    description:
      "Агрегована статистика тренувань Фізрука за період: частота на тиждень, улюблені вправи, розподіл по м'язових групах. Read-only. Для 'які м'язи я треную найчастіше?'.",
    input_schema: {
      type: "object",
      properties: {
        period_days: {
          type: "number",
          description: "За скільки останніх днів, 1-365 (опційно, default 30)",
        },
        top: {
          type: "number",
          description:
            "Скільки топ-вправ і топ-м'язів повернути, 1-20 (опційно, default 8)",
        },
      },
    },
  },
];
