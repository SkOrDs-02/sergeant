import type { AnthropicTool } from "./types.js";

export const FIZRUK_TOOLS: AnthropicTool[] = [
  {
    name: "plan_workout",
    description:
      "Створити (запланувати) тренування у Фізруку на сьогодні або вказану дату/час. Можна додати список вправ із підходами/повтореннями/вагою.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Дата тренування YYYY-MM-DD (опційно, за замовчуванням — сьогодні)",
        },
        time: {
          type: "string",
          description:
            "Час початку тренування HH:MM (опційно, за замовчуванням 09:00)",
        },
        note: {
          type: "string",
          description: "Коротка нотатка/назва тренування (опційно)",
        },
        exercises: {
          type: "array",
          description:
            "Список вправ. Кожна вправа: name (обов'язково), sets, reps, weight (опційно).",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Назва вправи" },
              sets: { type: "number", description: "Кількість підходів" },
              reps: { type: "number", description: "Повторень у підході" },
              weight: { type: "number", description: "Вага в кг" },
            },
            required: ["name"],
          },
        },
      },
    },
  },
  {
    name: "log_set",
    description:
      "Додати підхід (set) до тренування у Фізрук. Використовуй коли користувач каже 'я зробив X повторень Y кг жиму/присіду' тощо. Якщо зараз є активне тренування — додає підхід до відповідної вправи; інакше — створює нове тренування на сьогодні й додає туди.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "Назва вправи (напр. 'Жим штанги лежачи')",
        },
        weight_kg: {
          type: "number",
          description: "Вага в кг (0 — якщо власна вага)",
        },
        reps: { type: "number", description: "Кількість повторень у підході" },
        sets: {
          type: "number",
          description: "Скільки однакових підходів додати (опційно, default 1)",
        },
      },
      required: ["exercise_name", "reps"],
    },
  },
  {
    name: "start_workout",
    description:
      "Розпочати нове тренування зараз (або з вказаного часу). Зберігає як активне у Фізруку, щоб наступні log_set підходи записувались у нього. Якщо вже є активне — лише повідомляє про нього (ідемпотентно).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Коротка нотатка / назва" },
        date: {
          type: "string",
          description: "Дата YYYY-MM-DD (опційно, default — сьогодні)",
        },
        time: {
          type: "string",
          description: "Час початку HH:MM (опційно, default — зараз)",
        },
      },
    },
  },
  {
    name: "finish_workout",
    description:
      "Завершити поточне активне тренування (виставити endedAt=now) і прибрати активний статус. Якщо передано workout_id — завершує саме його. Ідемпотентно.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: {
          type: "string",
          description:
            "ID тренування (опційно; default — поточне активне або останнє незавершене)",
        },
      },
    },
  },
  {
    name: "log_measurement",
    description:
      "Записати антропометрію у Фізрук/Заміри. Можна передавати лише ті поля, які виміряні. Додає новий запис у журнал замірів (не перезаписує попередні).",
    input_schema: {
      type: "object",
      properties: {
        weight_kg: { type: "number", description: "Вага кг" },
        body_fat_pct: { type: "number", description: "% жиру" },
        neck_cm: { type: "number", description: "Шия см" },
        chest_cm: { type: "number", description: "Груди см" },
        waist_cm: { type: "number", description: "Талія см" },
        hips_cm: { type: "number", description: "Стегна (обхват) см" },
        bicep_l_cm: { type: "number", description: "Біцепс лівий см" },
        bicep_r_cm: { type: "number", description: "Біцепс правий см" },
        thigh_l_cm: { type: "number", description: "Стегно лівий см" },
        thigh_r_cm: { type: "number", description: "Стегно правий см" },
        calf_l_cm: { type: "number", description: "Литка лівий см" },
        calf_r_cm: { type: "number", description: "Литка правий см" },
      },
    },
  },
  {
    name: "add_program_day",
    description:
      "Додати/оновити день тижневого шаблону програми тренувань (fizruk_plan_template_v1). weekday: 0=неділя..6=субота. Ідемпотентно: перезаписує день за weekday.",
    input_schema: {
      type: "object",
      properties: {
        weekday: {
          type: "number",
          description: "День тижня 0-6 (0=нд, 1=пн, …, 6=сб)",
        },
        name: { type: "string", description: "Назва тренування дня" },
        exercises: {
          type: "array",
          description: "Список вправ для дня",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Назва вправи" },
              sets: { type: "number", description: "Кількість підходів" },
              reps: { type: "number", description: "Повторень" },
              weight: { type: "number", description: "Вага кг" },
            },
            required: ["name"],
          },
        },
      },
      required: ["weekday", "name"],
    },
  },
  {
    name: "log_wellbeing",
    description:
      "Записати самопочуття у щоденний журнал Фізрука: сон, енергія 1-5, настрій 1-5, вага, нотатка. Можна передавати лише частину полів.",
    input_schema: {
      type: "object",
      properties: {
        weight_kg: { type: "number", description: "Вага кг" },
        sleep_hours: { type: "number", description: "Годин сну" },
        energy_level: { type: "number", description: "Енергія 1-5" },
        mood_score: { type: "number", description: "Настрій 1-5" },
        note: { type: "string", description: "Нотатка (опційно)" },
      },
    },
  },
  {
    name: "log_weight",
    description:
      "Записати поточну вагу (кг) у щоденний журнал Фізрука. Аналог log_wellbeing, але лише з вагою — швидкий шлях для прокидання ваги.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        weight_kg: { type: "number", description: "Вага кг" },
        note: { type: "string", description: "Нотатка (опційно)" },
      },
      required: ["weight_kg"],
    },
  },
  {
    name: "suggest_workout",
    description:
      "Порадити тренування на основі історії: які м'язи давно не тренували, recovery atlas. Відповідай текстом-порадою (без запису), але якщо користувач скаже 'запиши' — використай plan_workout.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          description:
            "Бажаний фокус: 'upper', 'lower', 'full', 'push', 'pull', 'cardio' або група м'язів (опційно)",
        },
      },
    },
  },
  {
    name: "copy_workout",
    description:
      "Скопіювати минуле тренування як нове на сьогодні (або вказану дату). Беремо всі вправи, підходи, вагу з оригіналу.",
    input_schema: {
      type: "object",
      properties: {
        source_workout_id: {
          type: "string",
          description:
            "ID тренування-джерела. Якщо не вказано — копіює останнє завершене.",
        },
        date: {
          type: "string",
          description:
            "Дата нового тренування YYYY-MM-DD (опційно, default — сьогодні)",
        },
      },
    },
  },
  {
    name: "compare_progress",
    description:
      "Порівняти прогрес по вправі або м'язовій групі за період. Повертає текстовий аналіз з числами.",
    input_schema: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "Назва вправи (опційно, якщо хочеш по конкретній)",
        },
        muscle_group: {
          type: "string",
          description: "Група м'язів (опційно, напр. 'chest', 'biceps')",
        },
        period_days: {
          type: "number",
          description: "Період для порівняння в днях (default 30)",
        },
      },
    },
  },
];
