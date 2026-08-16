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
          description:
            "Іконка звички (опційно, за замовчуванням 'check'). Одне зі значень: check, target, flame, award, sparkles, lightbulb, droplet, run, dumbbell, activity, heart, scale, utensils, egg, coffee, leaf, shopping-cart, package, brain, book-open, pen, monitor, camera, file-text, clock, bell, calendar-check, moon, sun, home, briefcase, truck, piggy-bank, shield, tool, message-circle. Емодзі теж приймається — клієнт сам підбере найближчу іконку.",
        },
        recurrence: {
          type: "string",
          description:
            "Регулярність: 'daily' (щодня), 'weekdays' (будні), 'weekly' (у конкретні дні тижня), 'monthly' (щомісяця). За замовчуванням — 'daily'.",
        },
        weekdays: {
          type: "array",
          description:
            "Для recurrence='weekly': номери днів 0-6, тиждень починається з понеділка (0 — понеділок, 1 — вівторок, …, 6 — неділя). Узгоджено з set_habit_schedule. Опційно.",
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
      "Додати разову подію в календар Рутини (реалізовано як звичка recurrence='once' на одну дату). Корисно для нагадувань про зустріч, день народження тощо.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва події" },
        date: { type: "string", description: "Дата YYYY-MM-DD" },
        time: { type: "string", description: "Час HH:MM (опційно)" },
        emoji: {
          type: "string",
          description:
            "Іконка події (опційно, за замовчуванням 'calendar-check'). Той самий словник, що й у create_habit.",
        },
      },
      required: ["name", "date"],
    },
  },
  {
    name: "edit_habit",
    description:
      "Редагувати існуючу звичку: змінити назву, іконку, розклад. Передавати лише ті поля, які змінюються.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        name: { type: "string", description: "Нова назва (опційно)" },
        emoji: {
          type: "string",
          description:
            "Нова іконка (опційно). Той самий словник, що й у create_habit.",
        },
        recurrence: {
          type: "string",
          description:
            "Нова регулярність: daily/weekdays/weekly/monthly (опційно)",
        },
        weekdays: {
          type: "array",
          description:
            "Нові дні тижня 0-6 для weekly, тиждень починається з понеділка (0 — понеділок, 1 — вівторок, …, 6 — неділя). Узгоджено з set_habit_schedule. Опційно.",
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
      "Заявити ПЛАНОВАНУ паузу звички датованим інтервалом (або повернути з паузи). Дні паузи випадають із розкладу: вони не рахуються пропусками і не ламають серію. Не видаляє і не архівує — історія виконань зберігається. Без `from` пауза починається сьогодні; без `to` діє, поки її не знято. Повернення закриває інтервал учорашнім днем — дні, що вже минули на паузі, лишаються паузою. Ідемпотентно: повторний виклик на той самий діапазон — no-op.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "ID звички" },
        paused: {
          type: "boolean",
          description:
            "true=поставити на паузу (default), false=повернути з паузи",
        },
        from: {
          type: "string",
          description:
            "Перший день паузи, YYYY-MM-DD (Europe/Kyiv). Для паузи «з сьогодні» передай сьогоднішню дату явно.",
        },
        to: {
          type: "string",
          description:
            "Останній день паузи включно, YYYY-MM-DD. Пропусти для паузи без заявленої дати кінця.",
        },
      },
      // `from` обовʼязковий навмисно: канон §4 говорить про ПЛАНОВАНУ паузу,
      // і явна дата початку — це саме те, що робить її планованою. Заразом це
      // тримає strict-grammar-бюджет: кожен optional-параметр коштує гілку в
      // граматиці (`strict-normalize.test.ts`).
      required: ["habit_id", "from"],
    },
  },
];
