/** @status Active */

export const finykPageMessages = {
  reportHeading: "Фінік (витрати)",
  addLimitOrGoal: "+ Додати ліміт або ціль",
  budgetOverLimit: "перевищено",
  budgetOverSixtyPercent: "· понад 60% ліміту",
  transactionsFilterLabel: "Фільтр транзакцій",
  daySummaryLabel: "сума за день",
  todaySummary: {
    title: "Сьогодні",
    dayScope: "Київська доба",
    operations: "Операції →",
    openAria: "Відкрити операції за сьогодні",
    expense: "Витрати",
    income: "Надходження",
    dailyPlan: "Денний план",
    planMissing: "Не задано",
    paceHidden: "Темп приховано",
  },
  todayFilter: {
    label: "Лише сьогодні",
    showAll: "Усі дні",
    showAllAria: "Показати всі дні",
  },
  transferSuggestion: {
    title: "Схоже на внутрішній переказ",
    hint: "Після підтвердження обидві операції не рахуватимуться як витрата чи дохід.",
    confirm: "Це переказ",
    dismiss: "Не зараз",
    confirmed: "Переказ не враховується у витратах і доходах.",
  },
  transactionDetails: {
    title: "Деталі операції",
    bankFactsReadonly: "дані банку не змінюються",
    done: "Готово",
    bankTransactionFallback: "Банківська операція",
    categoryAndNote: "Категорія та нотатка",
    splitTitle: "Розподіл за категоріями",
    splitPartsSuffix: "частини",
    splitHint: "За потреби розділи одну оплату на кілька категорій",
    changeSplit: "Змінити",
    createSplit: "Розділити",
    excludeLabel: "Не враховувати у статистиці",
    excludeDescription:
      "Операція лишиться у списку, але не впливатиме на аналітику",
    hideLabel: "Приховати зі списку",
    hideDescription: "Її можна повернути через показ прихованих операцій",
  },
  nonUahAssetsExcluded: {
    one: "актив в іноземній валюті не враховую в нетворсі",
    few: "активи в іноземній валюті не враховую в нетворсі",
    many: "активів в іноземній валюті не враховую в нетворсі",
  },
  nonUahAssetHint:
    "Збережу актив, але поки не враховую його в загальному капіталі — рахую лише активи в гривні.",
  monoCards: {
    sectionTitle: "Картки Monobank",
    fallbackName: "Картка",
    bankLabel: "Monobank",
    excluded: "Не враховується",
    settingsAriaSuffix: "налаштування картки",
    includeLabel: "Враховувати картку",
    includeHint:
      "Вимкнена картка не потрапляє в баланс, аналітику та статистику.",
  },
  monoConnectErrors: {
    tokenRejected: "Mono відхилив токен. Перевір, чи скопіював правильний.",
    networkUnavailable: "Не вдалось зв'язатись з Mono. Перевір з'єднання.",
  },
  jarSelector: {
    ariaLabel: "Банка Monobank",
    noJar: "Без банки",
  },
  // Staleness банку — контракт довіри §6.3 канону finyk. Копія навмисно
  // НЕ звинувачує банк: тиша webhook-а ззовні не відрізняється від тиші
  // користувача, тож стверджувати «інтеграція впала» було б вигадкою в
  // половині випадків. Кажемо перевірений факт і пропонуємо дію.
  monoStaleness: {
    title: "Дані не оновлювались",
    days: {
      one: "день",
      few: "дні",
      many: "днів",
    },
    hint: "Можливо, витрат справді не було — а можливо, зв'язок із банком обірвався. Перевір підключення, якщо цифри виглядають застарілими.",
    cta: "Перевірити підключення",
  },
} as const;
