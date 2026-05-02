// Assistant capability catalogue — single source of truth for the assistant's
// user-facing capabilities. Drives the catalogue UI, in-chat quick-action
// chips, and (post follow-up PR) the system prompt's tool list.
//
// Spec: docs/superpowers/specs/2026-04-25-assistant-capability-catalogue-design.md
//
// Invariants (enforced by assistantCatalogue.test.ts):
//   - all `id` values are unique;
//   - `requiresInput: true` ⇒ `prompt` ends with ": " (caller will prefill input,
//     not auto-send);
//   - every `module` has at least one entry;
//   - all `risky` ids are also listed in client `RISKY_TOOLS`.
//
// AI-NOTE: when adding a new server tool definition under
// apps/server/src/modules/chat/toolDefs/, add a matching entry here too.
// Without an entry the capability is invisible to the user and absent
// from /help, even though the model can still call it.

export type CapabilityModule =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "cross"
  | "analytics"
  | "utility"
  | "memory";

export interface AssistantCapability {
  /** Stable, snake_case. Matches AI tool name where possible. */
  id: string;
  /** UI grouping in the catalogue. */
  module: CapabilityModule;

  /** Full label for catalogue and chip (desktop). */
  label: string;
  /** Short label for mobile chip-strip. Falls back to `label` if absent. */
  shortLabel?: string;
  /** Icon name from `@shared/components/ui/Icon`. */
  icon: string;

  /** 1-2 sentence description shown in the catalogue card. */
  description: string;
  /** Example phrasings; first is reused in the system prompt. */
  examples: readonly string[];

  /**
   * Text sent to the chat when the user activates this capability.
   * If it ends with ": ", the catalogue prefills it into the input
   * instead of auto-sending. `requiresInput` must agree.
   */
  prompt: string;
  /** True ⇒ opens detail modal with prefill flow; false ⇒ auto-sends. */
  requiresInput: boolean;

  /** Destructive — shown with a warning badge. */
  risky?: boolean;
  /**
   * Recently added — shown with a "Новинка" badge in the catalogue.
   * Set to `true` for capabilities introduced in the last few releases;
   * flip back to `undefined` once the feature is no longer notable.
   */
  isNew?: boolean;
  /** Surfaced as a chip below the chat input. */
  isQuickAction?: boolean;
  /** Lower number sorts higher among quick-action chips. */
  quickActionPriority?: number;
  /** Disabled when offline (Anthropic-bound). */
  requiresOnline?: boolean;
  /** Extra search keywords (not displayed). */
  keywords?: readonly string[];

  /**
   * Server tool name for system-prompt generation.
   * - `undefined` (default): `id` IS the server tool name (validated against
   *   the actual TOOLS array on the server).
   * - `string`: explicit override when capability `id` diverges from the
   *   server tool name.
   * - `null`: prompt-only capability — no backing server tool. The model
   *   answers from the injected ДАНІ block (e.g. budget risk analysis,
   *   daily summary derived from numbers already in context).
   */
  serverTool?: string | null;
  /**
   * Optional terse hint emitted next to the tool name in the generated
   * system prompt (e.g. "dry_run спершу", "лише ручні m_<id>"). Helps the
   * model pick the right tool without bloating the prompt.
   */
  aiHint?: string;
}

/** Display order of modules in the catalogue UI. */
export const CAPABILITY_MODULE_ORDER: readonly CapabilityModule[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "cross",
  "analytics",
  "utility",
  "memory",
];

/** Module display titles + icons — used by the catalogue UI. */
export const CAPABILITY_MODULE_META: Record<
  CapabilityModule,
  { title: string; icon: string }
> = {
  finyk: { title: "Фінік", icon: "wallet" },
  fizruk: { title: "Фізрук", icon: "dumbbell" },
  routine: { title: "Рутина", icon: "check" },
  nutrition: { title: "Харчування", icon: "utensils" },
  cross: { title: "Кросмодульні", icon: "sparkles" },
  analytics: { title: "Аналітика", icon: "bar-chart" },
  utility: { title: "Утиліти", icon: "tool" },
  memory: { title: "Пам'ять", icon: "brain" },
};

// AI-NOTE: counts in section comments below match `ASSISTANT_CAPABILITIES`.
// Update them when adding/removing entries; tests assert per-module totals.
export const ASSISTANT_CAPABILITIES: readonly AssistantCapability[] = [
  // ───── Фінік (18) ─────────────────────────────────────────────────────
  {
    id: "create_transaction",
    module: "finyk",
    label: "Записати витрату або дохід",
    shortLabel: "Витрата",
    icon: "credit-card",
    description: "Швидкий запис витрати або доходу готівкою / карткою.",
    examples: [
      "додай витрату 200 грн на каву",
      "витратив 350 на таксі вчора",
      "+5000 зарплата сьогодні",
    ],
    prompt: "Додай витрату: ",
    requiresInput: true,
    isQuickAction: true,
    quickActionPriority: 10,
    requiresOnline: true,
    keywords: ["expense", "транзакція", "income"],
  },
  {
    id: "change_category",
    module: "finyk",
    label: "Змінити категорію",
    icon: "tag",
    description: "Перенести існуючу транзакцію в іншу категорію.",
    examples: [
      "перенеси останню транзакцію в їжу",
      "зміни категорію m_42 на транспорт",
    ],
    prompt: "Зміни категорію транзакції: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "find_transaction",
    module: "finyk",
    label: "Знайти транзакцію",
    icon: "search",
    description:
      "Пошук транзакції за описом, мерчантом, сумою або датою. Не змінює дані.",
    examples: [
      "знайди покупку в АТБ",
      "транзакція на 450 грн позавчора",
      "що було в Сільпо за тиждень",
    ],
    prompt: "Знайди транзакцію: ",
    requiresInput: true,
    requiresOnline: true,
    keywords: ["search", "пошук", "merchant"],
  },
  {
    id: "batch_categorize",
    module: "finyk",
    label: "Категоризувати масово",
    icon: "tags",
    description:
      "Перенести багато транзакцій в одну категорію за патерном. Спочатку показує preview (dry_run), застосовує лише після підтвердження.",
    examples: [
      "віднеси все Сільпо в продукти",
      "категоризуй всі АЗС на транспорт",
    ],
    prompt: "Категоризуй масово: ",
    requiresInput: true,
    requiresOnline: true,
    aiHint: "dry_run спершу",
    keywords: ["batch", "масово", "категорія"],
  },
  {
    id: "hide_transaction",
    module: "finyk",
    label: "Приховати транзакцію",
    icon: "eye-off",
    description: "Прибрати транзакцію зі статистики (без видалення).",
    examples: ["сховай транзакцію m_42 зі звіту"],
    prompt: "Сховай транзакцію: ",
    requiresInput: true,
    risky: true,
    requiresOnline: true,
  },
  {
    id: "delete_transaction",
    module: "finyk",
    label: "Видалити транзакцію",
    icon: "trash",
    description:
      "Видалити ручну транзакцію (m_*). Авто-транзакції не видаляються.",
    examples: ["видали останню транзакцію", "прибери m_42"],
    prompt: "Видали транзакцію: ",
    requiresInput: true,
    risky: true,
    requiresOnline: true,
    aiHint: "лише ручні m_<id>",
  },
  {
    id: "create_debt",
    module: "finyk",
    label: "Створити борг",
    icon: "arrow-up-right",
    description: "Записати, що ти комусь винен.",
    examples: ["я винен Олегу 500 грн", "створи борг Тарас 1200 до 1 травня"],
    prompt: "Я винен: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "create_receivable",
    module: "finyk",
    label: "Записати дебіторку",
    icon: "arrow-down-left",
    description: "Записати, що тобі хтось винен.",
    examples: ["мені винен Олег 500 грн", "Іра має повернути 800"],
    prompt: "Мені винні: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "mark_debt_paid",
    module: "finyk",
    label: "Погасити борг",
    icon: "check",
    description: "Позначити борг або дебіторку як погашену.",
    examples: ["оплатив борг Олегу", "Іра повернула 800"],
    prompt: "Погасив борг: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "budget_risks",
    module: "finyk",
    label: "Ліміт бюджету",
    shortLabel: "Бюджет",
    icon: "target",
    description: "Аналіз поточних лімітів і відхилень по категоріях.",
    examples: ["покажи ризики по бюджету", "де виходжу за ліміт"],
    prompt: "Покажи ризики по бюджетах і що варто змінити.",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 20,
    requiresOnline: true,
    keywords: ["budget", "ліміт", "risk"],
    serverTool: null,
  },
  {
    id: "set_budget_limit",
    module: "finyk",
    label: "Встановити ліміт",
    icon: "target",
    description: "Створити або змінити місячний ліміт для категорії.",
    examples: ["встанови ліміт на їжу 3000 грн", "ліміт на розваги 1500"],
    prompt: "Постав ліміт: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "update_budget",
    module: "finyk",
    label: "Оновити бюджет або ціль",
    icon: "refresh-cw",
    description: "Змінити вже існуючий ліміт або ціль заощаджень.",
    examples: [
      "підніми ліміт на їжу до 4000",
      "переіменуй ціль 'Авто' в 'Машина'",
    ],
    prompt: "Онови бюджет: ",
    requiresInput: true,
    requiresOnline: true,
    aiHint: "ліміт або ціль",
  },
  {
    id: "set_monthly_plan",
    module: "finyk",
    label: "Фінплан на місяць",
    icon: "clipboard",
    description: "Встановити плановий дохід / витрати / заощадження.",
    examples: [
      "встанови дохід 30000, витрати 20000",
      "план на місяць: дохід 25к, заощадження 5к",
    ],
    prompt: "Фінплан: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "add_asset",
    module: "finyk",
    label: "Додати актив",
    icon: "package",
    description: "Записати актив (депозит, готівка, інвестиція).",
    examples: ["додай актив Депозит 50000", "запиши готівку 10000 USD"],
    prompt: "Додай актив: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "import_monobank_range",
    module: "finyk",
    label: "Імпорт Monobank",
    icon: "download",
    description: "Завантажити транзакції Monobank за діапазон дат.",
    examples: ["завантаж транзакції за квітень", "імпорт з 1 по 15 травня"],
    prompt: "Імпортуй Monobank за період: ",
    requiresInput: true,
    risky: true,
    requiresOnline: true,
  },
  {
    id: "split_transaction",
    module: "finyk",
    label: "Розділити транзакцію",
    icon: "scissors",
    description: "Розбити одну покупку на кілька категорій.",
    examples: ["розділи покупку: 200 їжа, 100 побут"],
    prompt: "Розділи транзакцію: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "recurring_expense",
    module: "finyk",
    label: "Підписка / регулярний платіж",
    icon: "repeat",
    description: "Додати щомісячний автоматичний платіж.",
    examples: ["додай підписку Спортзал 500 грн 1-го числа"],
    prompt: "Додай регулярний платіж: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "export_report",
    module: "finyk",
    label: "Звіт по фінансах",
    icon: "file-text",
    description: "Згенерувати звіт за тиждень / місяць / період.",
    examples: ["зроби звіт за тиждень", "експортуй квітень в PDF"],
    prompt: "Зроби звіт за: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Фізрук (11) ────────────────────────────────────────────────────
  {
    id: "start_workout",
    module: "fizruk",
    label: "Почати тренування",
    shortLabel: "Тренування",
    icon: "dumbbell",
    description: "Стартувати сесію за програмою на сьогодні.",
    examples: ["почни тренування", "стартуй ноги"],
    prompt: "Почни тренування на сьогодні.",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 10,
    requiresOnline: true,
    keywords: ["workout", "gym"],
  },
  {
    id: "log_set",
    module: "fizruk",
    label: "Додати підхід",
    shortLabel: "Підхід",
    icon: "plus",
    description: "Записати вагу і повторення для вправи.",
    examples: ["жим 80кг 8 повторень", "присід 100 на 5"],
    prompt: "Додай підхід: ",
    requiresInput: true,
    isQuickAction: true,
    quickActionPriority: 20,
    requiresOnline: true,
  },
  {
    id: "finish_workout",
    module: "fizruk",
    label: "Завершити тренування",
    icon: "check-circle",
    description: "Завершити поточну тренувальну сесію.",
    examples: ["заверши тренування", "все, я закінчив"],
    prompt: "Заверши поточне тренування.",
    requiresInput: false,
    requiresOnline: true,
  },
  {
    id: "plan_workout",
    module: "fizruk",
    label: "Запланувати тренування",
    icon: "calendar-plus",
    description: "Поставити тренування на майбутню дату.",
    examples: ["заплануй ноги на завтра", "груди в п'ятницю"],
    prompt: "Заплануй тренування: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "add_program_day",
    module: "fizruk",
    label: "Додати день у програму",
    icon: "list",
    description: "Заповнити день тижня в програмі.",
    examples: ["додай пн: груди + трицепс", "вт: спина і біцепс"],
    prompt: "Додай день у програму: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "log_measurement",
    module: "fizruk",
    label: "Заміри тіла",
    icon: "ruler",
    description: "Записати замір (біцепс, талія, груди тощо).",
    examples: ["запиши біцепс 37", "талія 78 см"],
    prompt: "Запиши замір: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "log_weight",
    module: "fizruk",
    label: "Записати вагу",
    icon: "scale",
    description: "Зафіксувати поточну вагу тіла.",
    examples: ["запиши вагу 78 кг", "вага 80.5"],
    prompt: "Запиши вагу: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "log_wellbeing",
    module: "fizruk",
    label: "Самопочуття",
    icon: "heart",
    description: "Сон, енергія, настрій — щоденні маркери.",
    examples: ["сон 7 год, енергія 4, настрій 5"],
    prompt: "Самопочуття: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "suggest_workout",
    module: "fizruk",
    label: "Порада про тренування",
    icon: "lightbulb",
    description: "Запропонувати тренування на сьогодні.",
    examples: ["порадь що тренувати сьогодні"],
    prompt: "Порадь тренування на сьогодні.",
    requiresInput: false,
    requiresOnline: true,
  },
  {
    id: "copy_workout",
    module: "fizruk",
    label: "Повторити минуле тренування",
    icon: "copy",
    description: "Скопіювати тренування з попереднього дня.",
    examples: ["повтори вчорашнє тренування"],
    prompt: "Повтори вчорашнє тренування.",
    requiresInput: false,
    requiresOnline: true,
  },
  {
    id: "compare_progress",
    module: "fizruk",
    label: "Прогрес у вправі",
    icon: "trending-up",
    description: "Порівняти результат у вправі за період.",
    examples: ["як змінився мій жим за місяць", "прогрес у присіді за 3 міс"],
    prompt: "Порівняй прогрес: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Рутина (12) ─────────────────────────────────────────────────────
  {
    id: "mark_habit_done",
    module: "routine",
    label: "Позначити звичку",
    shortLabel: "Звичка",
    icon: "check",
    description: "Відмітити звичку виконаною на сьогодні.",
    examples: ["познач воду", "зробив медитацію"],
    prompt: "Познач звичку виконаною: ",
    requiresInput: true,
    isQuickAction: true,
    quickActionPriority: 10,
    requiresOnline: true,
  },
  {
    id: "complete_habit_for_date",
    module: "routine",
    label: "Звичка за конкретний день",
    icon: "calendar-check",
    description: "Поставити галочку звичці на минулий або майбутній день.",
    examples: ["познач воду за вчора", "виконав медитацію 1 травня"],
    prompt: "Виконав звичку: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "create_habit",
    module: "routine",
    label: "Створити звичку",
    icon: "plus-circle",
    description: "Додати нову щоденну або періодичну звичку.",
    examples: ["додай звичку пити воду щодня", "створи звичку медитація 10 хв"],
    prompt: "Створи звичку: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "create_reminder",
    module: "routine",
    label: "Поставити нагадування",
    icon: "bell",
    description: "Додати push-нагадування о визначеному часі.",
    examples: ["постав нагадування о 8:00", "нагадай випити воду о 14:00"],
    prompt: "Постав нагадування: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "edit_habit",
    module: "routine",
    label: "Редагувати звичку",
    icon: "edit",
    description: "Змінити назву, періодичність або опис звички.",
    examples: ["зміни назву звички 'Вода' на 'Питво'"],
    prompt: "Онови звичку: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "set_habit_schedule",
    module: "routine",
    label: "Дні тижня для звички",
    shortLabel: "Розклад",
    icon: "calendar",
    description:
      "Виставити точні дні тижня для звички (recurrence='weekly'). Приймає англ. (mon..sun) або укр. (пн..нд).",
    examples: [
      "тренування пн ср пт",
      "медитація щодня крім неділі",
      "біг tue thu sat",
    ],
    prompt: "Постав розклад звички: ",
    requiresInput: true,
    requiresOnline: true,
    isNew: true,
    aiHint: "примусово weekly",
    keywords: ["weekday", "schedule", "weekly", "розклад", "дні"],
  },
  {
    id: "pause_habit",
    module: "routine",
    label: "Поставити звичку на паузу",
    shortLabel: "Пауза",
    icon: "pause-circle",
    description:
      "Тимчасово відключити звичку без архівування — не потрапляє в календар і не шле нагадування. Оборотно.",
    examples: [
      "постав 'Біг' на паузу",
      "запаузь медитацію",
      "знов активуй воду",
    ],
    prompt: "Постав звичку на паузу: ",
    requiresInput: true,
    requiresOnline: true,
    isNew: true,
    aiHint: "ідемпотентно",
    keywords: ["pause", "resume", "unpause", "пауза", "відновити"],
  },
  {
    id: "archive_habit",
    module: "routine",
    label: "Архівувати звичку",
    icon: "archive",
    description: "Прибрати звичку з активного списку.",
    examples: ["заархівуй звичку 'Вода'"],
    prompt: "Архівуй звичку: ",
    requiresInput: true,
    risky: true,
    requiresOnline: true,
  },
  {
    id: "reorder_habits",
    module: "routine",
    label: "Порядок звичок",
    icon: "move",
    description: "Перевпорядкувати звички у списку.",
    examples: ["переміщуй вода вище медитації"],
    prompt: "Переміщуй звички: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "habit_stats",
    module: "routine",
    label: "Статистика звички",
    icon: "bar-chart-2",
    description: "Streak, відсоток виконання, графік за період.",
    examples: ["покажи статистику звички вода", "streak медитації"],
    prompt: "Статистика звички: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "missed_this_week",
    module: "routine",
    label: "Що пропущено за тиждень",
    shortLabel: "Пропущено",
    icon: "alert-circle",
    description: "Виписка пропущених звичок за поточний тиждень.",
    examples: ["що пропущено цього тижня", "де втрачені streak"],
    prompt: "Що я пропустив у рутині цього тижня?",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 20,
    requiresOnline: true,
    keywords: ["missed", "тиждень", "streak"],
    serverTool: null,
  },
  {
    id: "add_calendar_event",
    module: "routine",
    label: "Додати подію",
    icon: "calendar",
    description: "Зафіксувати подію в календарі (ДН, зустріч, дедлайн).",
    examples: [
      "додай подію ДН Олега 15 травня",
      "зустріч з Іриною завтра 18:00",
    ],
    prompt: "Додай подію: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Харчування (9) ─────────────────────────────────────────────────
  {
    id: "log_meal",
    module: "nutrition",
    label: "Залогати їжу",
    shortLabel: "Їжа",
    icon: "utensils",
    description: "Записати страву з калоріями і макросами.",
    examples: ["з'їв вівсянку 350 ккал", "обід: курка з рисом 600 ккал"],
    prompt: "Залогай їжу: ",
    requiresInput: true,
    isQuickAction: true,
    quickActionPriority: 10,
    requiresOnline: true,
  },
  {
    id: "log_water",
    module: "nutrition",
    label: "Випив воду",
    icon: "droplet",
    description: "Записати спожиту воду.",
    examples: ["випив 500 мл води", "0.3 л води"],
    prompt: "Випив воду: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "set_daily_plan",
    module: "nutrition",
    label: "Денна ціль",
    icon: "target",
    description: "Встановити цілі по калоріях, білку, жирах, вуглеводах.",
    examples: ["встанови ціль 2000 ккал, 120г білка"],
    prompt: "Денна ціль харчування: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "suggest_meal",
    module: "nutrition",
    label: "Що з'їсти зараз",
    icon: "lightbulb",
    description: "Порада що приготувати під поточний macro-баланс.",
    examples: ["що з'їсти щоб добити білок", "поради на вечерю"],
    prompt: "Що з'їсти сьогодні, щоб добити білок без перебору калорій?",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 20,
    requiresOnline: true,
    keywords: ["protein", "білок", "macro"],
  },
  {
    id: "add_recipe",
    module: "nutrition",
    label: "Зберегти рецепт",
    icon: "book-open",
    description: "Зберегти страву як шаблон для повторного використання.",
    examples: ["збережи рецепт омлету з 3 яєць"],
    prompt: "Збережи рецепт: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "add_to_shopping_list",
    module: "nutrition",
    label: "У список покупок",
    icon: "shopping-cart",
    description: "Додати продукт у список покупок.",
    examples: ["додай молоко в список", "купити: яйця, хліб, кава"],
    prompt: "Додай в список покупок: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "consume_from_pantry",
    module: "nutrition",
    label: "Прибрати з комори",
    icon: "minus-circle",
    description: "Списати продукт з домашньої комори.",
    examples: ["прибери яйця з комори", "використав 200г сиру"],
    prompt: "Прибери з комори: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "copy_meal_from_date",
    module: "nutrition",
    label: "Повторити їжу",
    icon: "copy",
    description: "Скопіювати прийом їжі з минулого дня.",
    examples: ["запиши те саме що вчора на обід"],
    prompt: "Повтори їжу: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "plan_meals_for_day",
    module: "nutrition",
    label: "Меню на день",
    icon: "clipboard-list",
    description: "Скласти план харчування на день під ціль.",
    examples: ["склади меню на 2000 ккал", "план на сьогодні з 120г білка"],
    prompt: "Склади меню на день: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Кросмодульні (5) ───────────────────────────────────────────────
  {
    id: "morning_briefing",
    module: "cross",
    label: "Ранковий брифінг",
    shortLabel: "Брифінг",
    icon: "sun",
    description: "Огляд планів і пріоритетів на сьогодні.",
    examples: ["що на сьогодні", "ранковий брифінг"],
    prompt: "Що важливого на сьогодні? Дай короткий ранковий брифінг.",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 10,
    requiresOnline: true,
    keywords: ["день", "сьогодні", "огляд"],
  },
  {
    id: "daily_summary",
    module: "cross",
    label: "Підсумок дня",
    shortLabel: "Підсумок",
    icon: "bar-chart",
    description: "Звіт про зроблене за день по всіх модулях.",
    examples: ["підсумуй день", "щоденний звіт"],
    prompt: "Підсумуй мій день по фінансах, тренуваннях, звичках і харчуванню.",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 20,
    requiresOnline: true,
    keywords: ["підсумок", "звіт", "вечір"],
    serverTool: null,
  },
  {
    id: "weekly_summary",
    module: "cross",
    label: "Підсумок тижня",
    icon: "calendar",
    description: "Звіт по всіх 4 модулях за тиждень.",
    examples: ["підсумуй тиждень", "тижневий звіт"],
    prompt:
      "Підсумуй мій тиждень по фінансах, тренуваннях, звичках і харчуванню.",
    requiresInput: false,
    requiresOnline: true,
    keywords: ["тиждень", "звіт"],
  },
  {
    id: "compare_weeks",
    module: "cross",
    label: "Порівняти тижні",
    shortLabel: "Тижні",
    icon: "bar-chart",
    description:
      "Порівняти два тижні по 4 модулях: витрати, тренування, звички, калорії.",
    examples: [
      "порівняй цей тиждень з минулим",
      "як я провів тиждень порівняно з попереднім",
      "compare_weeks 2026-W17 vs 2026-W16",
    ],
    prompt: "Порівняй цей тиждень з минулим по всіх модулях.",
    requiresInput: false,
    isQuickAction: true,
    quickActionPriority: 40,
    isNew: true,
    requiresOnline: true,
    keywords: ["тиждень", "порівняння", "аналіз"],
    aiHint: "YYYY-Www; default цей+минулий",
  },
  {
    id: "set_goal",
    module: "cross",
    label: "Поставити ціль",
    icon: "flag",
    description: "Зафіксувати велику ціль (схуднути, заробити, почати).",
    examples: [
      "хочу схуднути на 5 кг за 2 місяці",
      "ціль: заощадити 30000 до літа",
    ],
    prompt: "Поставити ціль: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Аналітика (5) — окрема UI-група, фізично у crossModule.ts ──────
  {
    id: "spending_trend",
    module: "analytics",
    label: "Тренд витрат",
    icon: "trending-down",
    description: "Графік сумарних витрат за період.",
    examples: ["який тренд витрат за місяць", "витрати останні 3 міс"],
    prompt: "Покажи тренд витрат: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "category_breakdown",
    module: "analytics",
    label: "Розбивка по категоріях",
    icon: "pie-chart",
    description: "Розкласти витрати на категорії pie-chart-ом.",
    examples: ["розбий витрати по категоріях", "топ категорії квітня"],
    prompt: "Розбий витрати по категоріях: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "weight_chart",
    module: "analytics",
    label: "Графік ваги",
    icon: "trending-up",
    description: "Динаміка ваги тіла за період.",
    examples: ["покажи вагу за 3 місяці", "графік ваги з січня"],
    prompt: "Покажи графік ваги: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "habit_trend",
    module: "analytics",
    label: "Тренд звичок",
    icon: "activity",
    description:
      "Скільки звичок виконано за тиждень / місяць; де провалено streak.",
    examples: ["який тренд по звичках за місяць", "streak останні 30 днів"],
    prompt: "Покажи тренд звичок за період: ",
    requiresInput: true,
    requiresOnline: true,
    keywords: ["streak", "habit", "тренд"],
  },
  {
    id: "detect_anomalies",
    module: "analytics",
    label: "Аномалії",
    icon: "alert-triangle",
    description: "Знайти нетипові витрати, пропуски, скачки ваги.",
    examples: ["знайди аномалії за місяць", "що дивне в моїх витратах"],
    prompt: "Знайди аномалії за: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Утиліти (5) ────────────────────────────────────────────────────
  {
    id: "calculate_1rm",
    module: "utility",
    label: "1RM калькулятор",
    icon: "calculator",
    description: "Порахувати максимум на 1 повторення з робочого підходу.",
    examples: ["1rm з жиму 80 на 8", "максимум присіду з 100 на 5"],
    prompt: "Порахуй 1RM: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "convert_units",
    module: "utility",
    label: "Конвертер одиниць",
    icon: "shuffle",
    description: "Перевести грами / кг, кал / кДж, унції / мл.",
    examples: ["скільки 200 г у фунтах", "10 oz у грамах"],
    prompt: "Конвертуй: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "save_note",
    module: "utility",
    label: "Зберегти нотатку",
    icon: "bookmark",
    description: "Швидкий нотес поза модулями.",
    examples: ["запиши: лікар у вівторок 10:00"],
    prompt: "Запиши нотатку: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "list_notes",
    module: "utility",
    label: "Мої нотатки",
    icon: "list",
    description: "Показати всі збережені нотатки.",
    examples: ["мої нотатки", "що я записував"],
    prompt: "Покажи мої нотатки.",
    requiresInput: false,
    requiresOnline: true,
  },
  {
    id: "export_module_data",
    module: "utility",
    label: "Експорт даних",
    icon: "download",
    description: "Викачати дані модуля у CSV / JSON.",
    examples: ["експортуй дані Фініка в csv", "вивантаж тренування в json"],
    prompt: "Експортуй дані: ",
    requiresInput: true,
    requiresOnline: true,
  },

  // ───── Пам'ять (4) ────────────────────────────────────────────────────
  {
    id: "remember",
    module: "memory",
    label: "Запам'ятати факт",
    icon: "brain",
    description: "Зафіксувати інформацію про себе (алергії, цілі, обмеження).",
    examples: [
      "запам'ятай: алергія на горіхи",
      "ціль — схуднути до 75 кг",
      "не їм після 20:00",
    ],
    prompt: "Запам'ятай: ",
    requiresInput: true,
    requiresOnline: true,
  },
  {
    id: "forget",
    module: "memory",
    label: "Забути факт",
    icon: "x-circle",
    description: "Прибрати факт з memory bank асистента.",
    examples: ["забудь що в мене алергія на горіхи", "видали факт про каву"],
    prompt: "Забудь: ",
    requiresInput: true,
    risky: true,
    requiresOnline: true,
  },
  {
    id: "my_profile",
    module: "memory",
    label: "Мій профіль",
    icon: "user",
    description: "Показати все, що асистент про тебе знає.",
    examples: ["що ти про мене знаєш", "покажи мій профіль"],
    prompt: "Що ти про мене запам'ятав?",
    requiresInput: false,
    requiresOnline: true,
  },
  {
    id: "recall_memory",
    module: "memory",
    label: "Пошук у памʼяті",
    shortLabel: "Згадати",
    icon: "search",
    description:
      "Семантичний пошук по ai-memory bank-у: чат, харчування, тренування, фінанси, журнал. Знаходить схожі записи, навіть якщо формулювання інше.",
    examples: [
      "що я їв коли худнув",
      "знайди мої тренування на витривалість",
      "коли я скаржився на сон",
    ],
    prompt: "Знайди в памʼяті: ",
    requiresInput: true,
    requiresOnline: true,
    isNew: true,
    keywords: ["recall", "search", "memory", "семантичний"],
  },
];

/**
 * Resolve the server tool name for a capability.
 * - `null` ⇒ prompt-only capability (no backing tool).
 * - `string` ⇒ explicit override.
 * - default ⇒ capability `id` is used as the tool name.
 */
export function getCapabilityServerTool(c: AssistantCapability): string | null {
  if (c.serverTool === null) return null;
  return c.serverTool ?? c.id;
}

/**
 * Capabilities surfaced as quick-action chips below the chat input.
 * Sorted by `quickActionPriority` ascending. Module-aware sorting (e.g. by
 * active module) is applied by the consumer.
 */
export function getQuickActionCapabilities(): readonly AssistantCapability[] {
  return [...ASSISTANT_CAPABILITIES]
    .filter((c) => c.isQuickAction === true)
    .sort(
      (a, b) => (a.quickActionPriority ?? 999) - (b.quickActionPriority ?? 999),
    );
}

/**
 * Modules that have a dedicated UI surface (URL hash, navigation tab).
 * Cross-module / analytics / utility / memory chips collapse onto the
 * generic "hub" bucket for the chip UI.
 */
const HUB_LIKE_MODULES: ReadonlySet<CapabilityModule> = new Set([
  "cross",
  "analytics",
  "utility",
  "memory",
]);

/** Whether a module is module-specific (i.e. not hub-like). */
function isDomainModule(m: CapabilityModule): boolean {
  return !HUB_LIKE_MODULES.has(m);
}

/**
 * `prompt` ending in `": "` ⇒ incomplete: caller should prefill the input
 * instead of auto-sending. Mirrors the `requiresInput` flag but works on
 * arbitrary strings (e.g. legacy presets).
 */
export function isIncompletePrompt(prompt: string): boolean {
  return /:\s$/.test(prompt);
}

/**
 * Sort: active module first, then hub-like (cross/analytics/utility/memory),
 * then remaining domain modules. Within a group by `quickActionPriority`
 * ascending; stable.
 */
export function sortQuickActionsForModule(
  actions: readonly AssistantCapability[],
  activeModule: CapabilityModule | null,
): AssistantCapability[] {
  const groupRank = (m: CapabilityModule): number => {
    if (activeModule && m === activeModule) return 0;
    if (HUB_LIKE_MODULES.has(m)) return 1;
    return 2;
  };
  return actions
    .map((a, idx) => ({ a, idx }))
    .sort((x, y) => {
      const dg = groupRank(x.a.module) - groupRank(y.a.module);
      if (dg !== 0) return dg;
      const dp =
        (x.a.quickActionPriority ?? 999) - (y.a.quickActionPriority ?? 999);
      if (dp !== 0) return dp;
      return x.idx - y.idx;
    })
    .map(({ a }) => a);
}

/** Top N quick-action chips after sorting; the rest go under the "Ще" toggle. */
export function pickTopQuickActions(
  actions: readonly AssistantCapability[],
  activeModule: CapabilityModule | null,
  limit = 6,
): AssistantCapability[] {
  return sortQuickActionsForModule(actions, activeModule).slice(0, limit);
}

/** Whether a capability's chip should be styled as "active". */
export function isActiveQuickActionModule(
  capability: AssistantCapability,
  activeModule: CapabilityModule | null,
): boolean {
  return (
    activeModule !== null &&
    capability.module === activeModule &&
    isDomainModule(activeModule)
  );
}

/** Group capabilities by module preserving CAPABILITY_MODULE_ORDER. */
export function groupCapabilitiesByModule(
  caps: readonly AssistantCapability[] = ASSISTANT_CAPABILITIES,
): Array<{ module: CapabilityModule; capabilities: AssistantCapability[] }> {
  const groups = new Map<CapabilityModule, AssistantCapability[]>();
  for (const c of caps) {
    const list = groups.get(c.module) ?? [];
    list.push(c);
    groups.set(c.module, list);
  }
  return CAPABILITY_MODULE_ORDER.filter((m) => groups.has(m)).map((m) => ({
    module: m,
    capabilities: groups.get(m)!,
  }));
}

/** Plain-text search across label / shortLabel / description / examples / keywords. */
export function searchCapabilities(query: string): AssistantCapability[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...ASSISTANT_CAPABILITIES];
  return ASSISTANT_CAPABILITIES.filter((c) => {
    const haystack = [
      c.label,
      c.shortLabel ?? "",
      c.description,
      ...c.examples,
      ...(c.keywords ?? []),
      c.module,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
