import type { AnthropicTool } from "./types.js";

/**
 * Read-only "talk to your data" query tools для Харчування (PR3
 * talk-to-your-data). Лише читають журнал їжі (`nutrition_log_v1`) на клієнті
 * й повертають числові відповіді / агрегації — без запису. Виконавці живуть у
 * `apps/web/src/core/lib/chatActions/queryNutritionActions.ts`.
 *
 * Навмисно НЕ `strict: true` — Anthropic ліміт 20 strict-tools на запит
 * (див. INCIDENT 2026-05-16 у `tools.ts`).
 */
export const QUERY_NUTRITION_TOOLS: AnthropicTool[] = [
  {
    name: "query_nutrition",
    description:
      "Пошук по журналу їжі за період з опційним фільтром за назвою продукту. Read-only. Для 'що я їв у понеділок?', 'скільки разів я їв курку за тиждень'. Повертає кількість прийомів, сумарні калорії й макроси та список.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Текст для пошуку в назві страви (опційно)",
        },
        date_from: {
          type: "string",
          description: "Початкова дата YYYY-MM-DD (опційно)",
        },
        date_to: {
          type: "string",
          description: "Кінцева дата YYYY-MM-DD (опційно)",
        },
        period_days: {
          type: "number",
          description:
            "Альтернатива діапазону дат — за скільки останніх днів, 1-365 (опційно, default 7)",
        },
        limit: {
          type: "number",
          description:
            "Максимум прийомів у списку, 1-100 (опційно, default 20)",
        },
      },
    },
  },
  {
    name: "nutrition_averages",
    description:
      "Середні денні показники харчування (калорії, білок, жири, вуглеводи) за період з трендом першої vs другої половини. Read-only. Для 'яка моя середня калорійність за тиждень?'. Рахує лише дні із записами.",
    input_schema: {
      type: "object",
      properties: {
        date_from: {
          type: "string",
          description: "Початкова дата YYYY-MM-DD (опційно)",
        },
        date_to: {
          type: "string",
          description: "Кінцева дата YYYY-MM-DD (опційно)",
        },
        period_days: {
          type: "number",
          description:
            "Альтернатива діапазону дат — за скільки останніх днів, 1-365 (опційно, default 7)",
        },
      },
    },
  },
];
