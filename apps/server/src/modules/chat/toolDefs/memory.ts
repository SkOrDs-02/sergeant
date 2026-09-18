import type { AnthropicTool } from "./types.js";

/**
 * Канонічні категорії памʼяті. Дзеркалять ключі `CATEGORY_META` у
 * `apps/web/src/core/profile/memoryBank.ts` — секція «Памʼять ШІ» групує
 * записи саме по цьому полю, а клієнтський виконавець (`crossActions/
 * memoryHandlers.ts`) зводить усе поза цим списком у `other`.
 *
 * Тримаємо тут як `enum` у схемі, а не лише переліком у `description`:
 * прозовий перелік модель ігнорувала разом із самим полем (воно було
 * `optional`), і в проді практично все осідало в «Інше».
 */
const MEMORY_CATEGORIES = [
  "allergy",
  "diet",
  "goal",
  "training",
  "health",
  "preference",
  "other",
] as const;

export const MEMORY_TOOLS: AnthropicTool[] = [
  {
    name: "remember",
    // `strict: true` — grammar-constrained sampling гарантує, що `category`
    // приїде і буде з `enum`. Без нього `required` для не-strict tool-а
    // лишається проханням, а саме воно тут і не спрацювало. Бюджет
    // Anthropic (≤20 strict-tools на запит) це витримує: 14 → 15.
    strict: true,
    description:
      "Запамʼятати ОДИН факт про користувача: алергію, уподобання, ціль, обмеження тощо. Наприклад: 'запамʼятай що я не їм глютен'. Зберігається між сесіями. " +
      "Один виклик — один самодостатній факт коротким рядком. Почув кілька фактів — виклич інструмент кілька разів; склеєний в один запис абзац користувач не зможе видалити частинами, і семантичний пошук по ньому працює гірше.",
    input_schema: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "Один факт для запамʼятовування, коротким рядком",
        },
        category: {
          type: "string",
          enum: [...MEMORY_CATEGORIES],
          description:
            "Категорія факту — по ній групується список у профілі. Немає відповідної — 'other'.",
        },
      },
      required: ["fact", "category"],
    },
  },
  {
    name: "forget",
    description:
      "Видалити раніше запамʼятований факт. 'Забудь про алергію на глютен'",
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
      "Показати всі запамʼятовані факти про користувача. 'Що ти про мене знаєш?'",
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
