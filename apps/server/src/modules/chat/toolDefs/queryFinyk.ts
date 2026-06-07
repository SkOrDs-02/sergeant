import type { AnthropicTool } from "./types.js";

/**
 * Read-only "talk to your data" query tools для Фініка. На відміну від
 * мутаційних `FINYK_TOOLS`, ці інструменти лише читають транзакції з
 * клієнтського localStorage і повертають числові відповіді / агрегації —
 * без жодного запису. Виконавці живуть у
 * `apps/web/src/core/lib/chatActions/queryFinykActions.ts`.
 *
 * Навмисно НЕ `strict: true` — Anthropic ліміт 20 strict-tools на запит
 * (див. INCIDENT 2026-05-16 у `tools.ts`), а ці три не критичні до
 * grammar-constrained sampling.
 */
export const QUERY_FINYK_TOOLS: AnthropicTool[] = [
  {
    name: "query_transactions",
    description:
      "Пошук і вибірка транзакцій Фініка за фільтрами для відповіді на питання по даних (напр. 'покажи всі покупки в АТБ більше 200 грн за квітень'). Read-only — нічого не змінює. Повертає кількість, суму і список. Для категоризації використовуй find_transaction.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Текст для пошуку в описі, мерчанті, категорії або id (опційно)",
        },
        category: {
          type: "string",
          description:
            "Фільтр за категорією: id з блоку [Категорії] або підпис категорії (опційно)",
        },
        type: {
          type: "string",
          description:
            "'expense' (витрати) або 'income' (доходи). Без значення — усі (опційно)",
        },
        amount: {
          type: "number",
          description: "Сума у грн для пошуку (опційно)",
        },
        amount_tolerance: {
          type: "number",
          description: "Допуск для amount у грн (опційно, default 0.01)",
        },
        date_from: {
          type: "string",
          description: "Початкова дата YYYY-MM-DD (опційно)",
        },
        date_to: {
          type: "string",
          description: "Кінцева дата YYYY-MM-DD (опційно)",
        },
        limit: {
          type: "number",
          description:
            "Максимум транзакцій у списку, 1-100 (опційно, default 20)",
        },
      },
    },
  },
  {
    name: "aggregate_spending",
    description:
      "Агрегувати витрати або доходи Фініка за період з групуванням (по категоріях, днях, тижнях, місяцях або мерчантах). Read-only. Використовуй для 'скільки я витратив на транспорт за квартал', 'розбий витрати по категоріях за травень'. Повертає загальну суму і топ-групи за спаданням.",
    input_schema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          description:
            "'category' | 'day' | 'week' | 'month' | 'merchant' (default 'category')",
        },
        type: {
          type: "string",
          description:
            "'expense' (витрати) або 'income' (доходи). Default 'expense'",
        },
        date_from: {
          type: "string",
          description:
            "Початкова дата YYYY-MM-DD (опційно; default — початок поточного місяця)",
        },
        date_to: {
          type: "string",
          description: "Кінцева дата YYYY-MM-DD (опційно; default — сьогодні)",
        },
        top: {
          type: "number",
          description: "Скільки груп повернути, 1-30 (опційно, default 10)",
        },
      },
    },
  },
  {
    name: "compare_periods",
    description:
      "Порівняти два довільні періоди за метрикою (витрати, дохід або кількість транзакцій) у Фініку. Read-only. Використовуй для 'порівняй витрати березня і квітня', 'наскільки більше я витратив цього місяця'. Повертає обидві суми, абсолютну і відсоткову різницю.",
    input_schema: {
      type: "object",
      properties: {
        period_a_from: {
          type: "string",
          description: "Період A: початкова дата YYYY-MM-DD",
        },
        period_a_to: {
          type: "string",
          description: "Період A: кінцева дата YYYY-MM-DD",
        },
        period_b_from: {
          type: "string",
          description: "Період B: початкова дата YYYY-MM-DD",
        },
        period_b_to: {
          type: "string",
          description: "Період B: кінцева дата YYYY-MM-DD",
        },
        metric: {
          type: "string",
          description:
            "'spending' (витрати) | 'income' (дохід) | 'count' (кількість). Default 'spending'",
        },
      },
      required: [
        "period_a_from",
        "period_a_to",
        "period_b_from",
        "period_b_to",
      ],
    },
  },
];
