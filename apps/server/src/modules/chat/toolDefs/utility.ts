import type { AnthropicTool } from "./types.js";

export const UTILITY_TOOLS: AnthropicTool[] = [
  {
    name: "calculate_1rm",
    description:
      "Калькулятор 1RM (одноповторний максимум) по формулі Епллі. Наприклад: 'який мій 1RM для жиму 80кг на 8 повторень?'",
    input_schema: {
      type: "object",
      properties: {
        weight_kg: { type: "number", description: "Вага кг" },
        reps: { type: "number", description: "Кількість повторень" },
        exercise_name: {
          type: "string",
          description: "Назва вправи (опційно, для контексту)",
        },
      },
      required: ["weight_kg", "reps"],
    },
  },
  {
    name: "convert_units",
    description:
      "Конвертер одиниць: кг↔фунти, см↔дюйми, км↔милі, °C↔°F, ккал↔кДж. Наприклад: 'переведи 80 кг в фунти'",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Значення для конвертації" },
        from: {
          type: "string",
          description: "Вхідна одиниця: kg, lb, cm, in, km, mi, c, f, kcal, kj",
        },
        to: {
          type: "string",
          description:
            "Вихідна одиниця: kg, lb, cm, in, km, mi, c, f, kcal, kj",
        },
      },
      required: ["value", "from", "to"],
    },
  },
  {
    name: "save_note",
    description:
      "Зберегти нотатку / нагадування. Наприклад: 'запиши: купити протеїн'",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Текст нотатки" },
        tag: {
          type: "string",
          description: "Тег/категорія (опційно): todo, idea, reminder, other",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "list_notes",
    description: "Показати збережені нотатки. Можна фільтрувати по тегу.",
    input_schema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          description: "Фільтр по тегу (опційно)",
        },
        limit: {
          type: "number",
          description: "Максимум записів (default 10)",
        },
      },
    },
  },
  {
    name: "export_module_data",
    description:
      "Експортувати дані модуля у текстовому форматі. 'Експортуй всі тренування' або 'покажи всі звички'",
    input_schema: {
      type: "object",
      properties: {
        module: {
          type: "string",
          description: "Модуль: finyk, fizruk, routine, nutrition",
        },
        format: {
          type: "string",
          description: "Формат: text (default), json, csv",
        },
      },
      required: ["module"],
    },
  },
];
