import type { AnthropicTool } from "./types.js";

export const FINYK_TOOLS: AnthropicTool[] = [
  {
    name: "change_category",
    description:
      "Змінити категорію транзакції. Використовуй коли користувач просить перенести транзакцію в іншу категорію.",
    input_schema: {
      type: "object",
      properties: {
        tx_id: {
          type: "string",
          description: "ID транзакції з блоку [Останні операції]",
        },
        category_id: {
          type: "string",
          description: "ID категорії з блоку [Категорії]",
        },
      },
      required: ["tx_id", "category_id"],
    },
  },
  {
    name: "find_transaction",
    description:
      "Знайти транзакції у Фініку за описом/мерчантом, сумою або датою. Використовуй перед категоризацією, коли користувач каже 'знайди покупку в АТБ' або 'транзакція на 450 грн позавчора'. Не змінює дані.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Текст для пошуку в описі, мерчанті, категорії або id транзакції",
        },
        amount: {
          type: "number",
          description: "Сума у грн для пошуку (опційно)",
        },
        amount_tolerance: {
          type: "number",
          description:
            "Допуск для amount у грн (опційно, за замовчуванням 0.01)",
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
          description: "Максимум результатів, 1-10 (опційно, default 5)",
        },
      },
    },
  },
  {
    name: "batch_categorize",
    description:
      "Масово змінити категорію транзакцій за текстовим патерном і фільтрами. За замовчуванням dry_run=true — спершу показує preview без запису. Виконуй з dry_run=false тільки коли користувач підтвердив застосування.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            "Текстовий патерн для опису/мерчанта/category/id (напр. 'Сільпо')",
        },
        category_id: {
          type: "string",
          description: "Цільовий id категорії з блоку [Категорії]",
        },
        dry_run: {
          type: "boolean",
          description:
            "true — лише preview без запису; false — застосувати зміни. Default true",
        },
        amount: {
          type: "number",
          description: "Опційний фільтр суми у грн",
        },
        amount_tolerance: {
          type: "number",
          description:
            "Допуск для amount у грн (опційно, за замовчуванням 0.01)",
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
            "Максимум транзакцій для preview/apply, 1-50 (default 20)",
        },
      },
      required: ["pattern", "category_id"],
    },
  },
  {
    name: "create_debt",
    description: "Створити новий борг (я винен комусь).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва боргу або кому винен" },
        amount: { type: "number", description: "Сума боргу в грн" },
        due_date: {
          type: "string",
          description: "Дата погашення YYYY-MM-DD (опціонально)",
        },
        emoji: {
          type: "string",
          description: "Емодзі (опціонально, за замовчуванням 💸)",
        },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "create_receivable",
    description: "Додати дебіторку (мені хтось винен).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Хто винен" },
        amount: { type: "number", description: "Сума в грн" },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "hide_transaction",
    description: "Приховати транзакцію зі статистики.",
    input_schema: {
      type: "object",
      properties: {
        tx_id: { type: "string", description: "ID транзакції" },
      },
      required: ["tx_id"],
    },
  },
  {
    name: "set_budget_limit",
    description: "Встановити або змінити ліміт бюджету для категорії.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "ID категорії" },
        limit: { type: "number", description: "Ліміт в грн на місяць" },
      },
      required: ["category_id", "limit"],
    },
  },
  {
    name: "set_monthly_plan",
    description:
      "Задати або оновити місячний фінплан (планові дохід, витрати, заощадження у грн/міс). Можна передати лише ті поля, які змінюються.",
    input_schema: {
      type: "object",
      properties: {
        income: {
          type: "number",
          description: "Плановий дохід грн/міс (опційно)",
        },
        expense: {
          type: "number",
          description: "Планові витрати грн/міс (опційно)",
        },
        savings: {
          type: "number",
          description: "Планові заощадження грн/міс (опційно)",
        },
      },
    },
  },
  {
    name: "create_transaction",
    description:
      "Записати ручну витрату або дохід у Фінік. Використовуй коли користувач повідомляє що витратив/отримав кошти (напр. 'я витратив 200 грн на каву', 'запиши дохід 5000 грн').",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "'expense' (витрата) або 'income' (дохід). Default: expense.",
        },
        amount: {
          type: "number",
          description: "Сума в грн (завжди додатнє число)",
        },
        category: {
          type: "string",
          description:
            "Категорія: або id канонічної категорії (food, transport, restaurant, subscriptions, health тощо) з блоку [Категорії], або підпис manual-категорії (напр. 'їжа', 'транспорт'). Для доходу можна лишити порожнім.",
        },
        description: {
          type: "string",
          description: "Короткий опис / мерчант (опційно)",
        },
        date: {
          type: "string",
          description: "Дата YYYY-MM-DD (опційно, за замовчуванням — сьогодні)",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "delete_transaction",
    description:
      "Видалити ручну транзакцію з Фініка. Приймає id ручної транзакції (починається з 'm_') — такий, як у блоці [Останні операції]. Монобанк-транзакції видалити не можна — для них використовуй hide_transaction. Ідемпотентно: якщо транзакції немає — повертає відповідне повідомлення.",
    input_schema: {
      type: "object",
      properties: {
        tx_id: {
          type: "string",
          description:
            // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- pattern syntax for the LLM (m_<suffix> placeholder), not user-facing copy
            "ID ручної транзакції (формат 'm_...'). Напр. 'm_abc123'",
        },
      },
      required: ["tx_id"],
    },
  },
  {
    name: "update_budget",
    description:
      "Оновити або створити бюджет: або ліміт на категорію (scope='limit'), або ціль заощаджень (scope='goal'). Для ліміту потрібні category_id + limit. Для цілі — name + target_amount, опціонально saved_amount. Ідемпотентно (upsert).",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "'limit' — ліміт витрат на категорію; 'goal' — ціль заощаджень",
        },
        category_id: {
          type: "string",
          description: "Для scope='limit': id категорії з блоку [Категорії]",
        },
        limit: {
          type: "number",
          description: "Для scope='limit': сума ліміту грн/міс",
        },
        name: {
          type: "string",
          description: "Для scope='goal': назва цілі (напр. 'Відпустка')",
        },
        target_amount: {
          type: "number",
          description: "Для scope='goal': цільова сума грн",
        },
        saved_amount: {
          type: "number",
          description: "Для scope='goal': вже накопичена сума грн (опційно)",
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "mark_debt_paid",
    description:
      "Відмітити борг як (частково чи повністю) сплачений. Створює ручну витрату-погашення на вказану суму (якщо не задано — на суму боргу) і лінкує її до боргу (linkedTxIds). Якщо повна сума покрита — борг вважається закритим. ID боргу беріть з блоку [Борги].",
    input_schema: {
      type: "object",
      properties: {
        debt_id: {
          type: "string",
          // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- pattern syntax for the LLM (d_<suffix> placeholder), not user-facing copy
          description: "ID боргу (формат 'd_...')",
        },
        amount: {
          type: "number",
          description:
            "Сума погашення грн (опційно; за замовчуванням — повна сума боргу)",
        },
        note: {
          type: "string",
          description: "Короткий опис транзакції (опційно)",
        },
      },
      required: ["debt_id"],
    },
  },
  {
    name: "add_asset",
    description:
      "Додати актив (вклад, готівка, нерухомість, авто тощо) у розділ Фінік/Активи.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Назва активу" },
        amount: { type: "number", description: "Сума грн (або в currency)" },
        currency: {
          type: "string",
          description: "Валюта 3 літери (опційно, default 'UAH')",
        },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "import_monobank_range",
    description:
      "Попросити Фінік перезавантажити транзакції з Монобанку за період YYYY-MM-DD..YYYY-MM-DD. Очищує кеш відповідних місяців і диспатчить подію, на яку реагує модуль Фінік. Сам імпорт виконується коли користувач відкриє Фінік (потрібен токен).",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Початкова дата YYYY-MM-DD" },
        to: { type: "string", description: "Кінцева дата YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "split_transaction",
    description:
      "Розділити транзакцію на кілька частин по категоріях. Наприклад: покупка в супермаркеті — 200 грн їжа, 100 грн побут.",
    input_schema: {
      type: "object",
      properties: {
        tx_id: { type: "string", description: "ID транзакції для розділення" },
        parts: {
          type: "array",
          description: "Частини: кожна має category_id та amount",
          items: {
            type: "object",
            properties: {
              category_id: { type: "string", description: "ID категорії" },
              amount: { type: "number", description: "Сума частини грн" },
            },
            required: ["category_id", "amount"],
          },
        },
      },
      required: ["tx_id", "parts"],
    },
  },
  {
    name: "recurring_expense",
    description:
      "Створити повторювану витрату (підписку/регулярний платіж). Записується як підписка у Фініку.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Назва платежу (напр. 'Спортзал')",
        },
        amount: { type: "number", description: "Сума грн" },
        day_of_month: {
          type: "number",
          description: "День місяця для списання (1-31)",
        },
        category: {
          type: "string",
          description: "Категорія (опційно)",
        },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "export_report",
    description:
      "Згенерувати текстовий звіт по фінансах за період. Повертає markdown-форматований звіт.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description:
            "'week' (тиждень), 'month' (місяць), 'custom' (кастомний)",
        },
        from: {
          type: "string",
          description: "Початкова дата YYYY-MM-DD (для period='custom')",
        },
        to: {
          type: "string",
          description: "Кінцева дата YYYY-MM-DD (для period='custom')",
        },
      },
    },
  },
];
