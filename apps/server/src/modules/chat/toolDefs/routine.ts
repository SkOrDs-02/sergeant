import type { AnthropicTool } from "./types.js";

export const ROUTINE_TOOLS: AnthropicTool[] = [
  {
    name: "mark_habit_done",
    description:
      "Відмітити звичку як виконану на сьогодні (або на вказану дату). ID звички беріть з блоку [Рутина сьогодні].",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        habit_id: {
          type: "string",
          // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- pattern syntax for the LLM (id:<id> placeholder), not user-facing copy
          description: "ID звички (id:... з блоку [Рутина сьогодні])",
        },
        date: {
          type: "string",
          description: "Дата YYYY-MM-DD (опційно, за замовчуванням — сьогодні)",
        },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "create_habit",
    description:
      "Створити нову звичку в модулі Рутина. Використовуй коли користувач просить додати / завести / почати нову звичку (напр. 'додай звичку пити воду', 'заведи пробіжку щопонеділка').",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва звички" },
        emoji: {
          type: "string",
          description: "Емодзі (опційно, за замовчуванням ✓)",
        },
        recurrence: {
          type: "string",
          description:
            "Регулярність: 'daily' (щодня), 'weekdays' (будні), 'weekly' (у конкретні дні тижня), 'monthly' (щомісяця). За замовчуванням — 'daily'.",
        },
        weekdays: {
          type: "array",
          description:
            "Для recurrence='weekly': номери днів 0-6 (0 — неділя, 1 — понеділок, …, 6 — субота). Опційно.",
          items: { type: "number" },
        },
        time_of_day: {
          type: "string",
          description: "Час доби HH:MM (опційно, напр. '08:00')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Додати час нагадування HH:MM до звички у Рутині. ID звички — з блоку [Рутина сьогодні]. Ідемпотентно: якщо такий час вже є — не дублюється.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        time: { type: "string", description: "Час HH:MM (напр. '08:00')" },
      },
      required: ["habit_id", "time"],
    },
  },
  {
    name: "complete_habit_for_date",
    description:
      "Позначити або зняти позначку виконання звички на конкретну дату YYYY-MM-DD. Якщо completed=false — знімає позначку; default=true.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        date: { type: "string", description: "Дата YYYY-MM-DD" },
        completed: {
          type: "boolean",
          description: "true=позначити, false=зняти (default true)",
        },
      },
      required: ["habit_id", "date"],
    },
  },
  {
    name: "archive_habit",
    description:
      "Заархівувати звичку (прибрати зі списку активних) або повернути з архіву. Ідемпотентно.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        archived: {
          type: "boolean",
          description: "true=заархівувати (default), false=повернути з архіву",
        },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "add_calendar_event",
    description:
      "Додати разову подію в календар Рутини (реалізовано як звичка recurrence='once' на одну дату). Корисно для нагадувань про зустріч, деньнародження тощо.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва події" },
        date: { type: "string", description: "Дата YYYY-MM-DD" },
        time: { type: "string", description: "Час HH:MM (опційно)" },
        emoji: { type: "string", description: "Емодзі (опційно)" },
      },
      required: ["name", "date"],
    },
  },
  {
    name: "edit_habit",
    description:
      "Редагувати існуючу звичку: змінити назву, емодзі, розклад. Передавати лише ті поля, які змінюються.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        name: { type: "string", description: "Нова назва (опційно)" },
        emoji: { type: "string", description: "Новий емодзі (опційно)" },
        recurrence: {
          type: "string",
          description:
            "Нова регулярність: daily/weekdays/weekly/monthly (опційно)",
        },
        weekdays: {
          type: "array",
          description: "Нові дні тижня 0-6 для weekly (опційно)",
          items: { type: "number" },
        },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "reorder_habits",
    description:
      "Змінити порядок відображення звичок. Передати масив ID у бажаному порядку.",
    input_schema: {
      type: "object",
      properties: {
        habit_ids: {
          type: "array",
          description: "Масив ID звичок у бажаному порядку",
          items: { type: "string" },
        },
      },
      required: ["habit_ids"],
    },
  },
  {
    name: "habit_stats",
    description:
      "Показати детальну статистику по конкретній звичці: серія, % виконання, пропуски за останні N днів.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        period_days: {
          type: "number",
          description: "Період аналізу в днях (default 30)",
        },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "set_habit_schedule",
    description:
      "Виставити точні дні тижня для звички (recurrence='weekly'). Передавай дні англ. ('mon','tue','wed','thu','fri','sat','sun') або укр. коротко ('пн','вт','ср','чт','пт','сб','нд'). Регістр і порядок не важливі. Приклад: 'тренування пн/ср/пт' → days=['mon','wed','fri'].",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        days: {
          type: "array",
          description:
            "Дні тижня: англ. ('mon','tue',…,'sun') або укр. ('пн','вт','ср','чт','пт','сб','нд').",
          items: { type: "string" },
        },
      },
      required: ["habit_id", "days"],
    },
  },
  {
    name: "pause_habit",
    description:
      "Тимчасово поставити звичку на паузу (або зняти з паузи). Не видаляє і не архівує — звичка зберігає історію виконань. Ідемпотентно: повторний виклик з тим самим прапором — no-op.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        paused: {
          type: "boolean",
          description: "true=поставити на паузу (default), false=зняти з паузи",
        },
      },
      required: ["habit_id"],
    },
  },
];
