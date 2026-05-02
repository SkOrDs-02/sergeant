import type { AnthropicTool } from "./types.js";

export const MEMORY_TOOLS: AnthropicTool[] = [
  {
    name: "remember",
    description:
      "Запам'ятати факт про користувача: алергії, уподобання, цілі, обмеження тощо. Наприклад: 'запам'ятай що я не їм глютен'. Зберігається між сесіями.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "Факт для запам'ятовування" },
        category: {
          type: "string",
          description:
            "Категорія: allergy, diet, goal, training, health, preference, other",
        },
      },
      required: ["fact"],
    },
  },
  {
    name: "forget",
    description:
      "Видалити раніше запам'ятований факт. 'Забудь про алергію на глютен'",
    input_schema: {
      type: "object",
      properties: {
        fact_id: {
          type: "string",
          description: "ID факту (з my_profile) або текст факту для пошуку",
        },
      },
      required: ["fact_id"],
    },
  },
  {
    name: "my_profile",
    description:
      "Показати всі запам'ятовані факти про користувача. 'Що ти про мене знаєш?'",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Фільтр по категорії (опційно)",
        },
      },
    },
  },
  {
    name: "recall_memory",
    description:
      "Знайти в семантичній памʼяті схожі записи (chat / nutrition / fizruk / journal / routine / finyk / digest) за запитом. " +
      "Викликай коли користувач просить нагадати або порадити щось схоже на минулий досвід (наприклад: 'що я їв коли худнув', " +
      "'мої тренування на 5к', 'покажи витрати на каву'). Повертає список записів з оригінальним текстом і score близькості.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Текстовий запит для семантичного пошуку (наприклад, 'тренування на витривалість').",
        },
        top_k: {
          type: "number",
          description:
            "Скільки результатів повернути (1..50). За замовчуванням — серверний AI_MEMORY_TOP_K (8).",
        },
        sources: {
          type: "array",
          description:
            "Опційний фільтр по джерелах: chat, finyk, fizruk, nutrition, routine, journal, digest.",
          items: { type: "string" },
        },
      },
      required: ["query"],
    },
  },
];
