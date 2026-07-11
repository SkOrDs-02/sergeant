// Спеціальний ID для внутрішніх переказів між своїми рахунками.
// Транзакції з цією категорією НЕ рахуються у витратах і доходах.
export const INTERNAL_TRANSFER_ID = "internal_transfer";

export const MCC_CATEGORIES = [
  {
    id: "food",
    label: "🛒 Продукти",
    mccs: [5411, 5412, 5422, 5441, 5451, 5462, 5499],
    keywords: [
      "сільпо",
      "атб",
      "новус",
      "fora",
      "metro",
      "ашан",
      "продукт",
      "супермаркет",
      "grocery",
      "наш край",
      "rancho",
      "ранчо",
      "магазин",
      "садочок",
    ],
  },
  {
    id: "restaurant",
    label: "🍔 Кафе та ресторани",
    mccs: [5812, 5813, 5814],
    keywords: [
      "макдональд",
      "mcdonald",
      "pizza",
      "піца",
      "burger",
      "кафе",
      "ресторан",
      "суші",
      "sushi",
      "wok",
      "kfc",
      "domino",
    ],
  },
  {
    id: "transport",
    label: "🚗 Транспорт",
    mccs: [4111, 4121, 4131, 5541, 5542, 5172],
    keywords: [
      "uber",
      "bolt",
      "таксі",
      "заправка",
      "wog",
      "okko",
      "shell",
      "укрзалізниця",
      "метро",
    ],
  },
  {
    id: "subscriptions",
    label: "🎵 Підписки",
    mccs: [4899, 5735, 7372],
    keywords: [
      "spotify",
      "netflix",
      "apple",
      "google",
      "youtube",
      "steam",
      "chatgpt",
      "icloud",
      "openai",
    ],
  },
  {
    id: "health",
    label: "💊 Здоров'я",
    mccs: [5122, 5912, 8011, 8021, 8049, 8099],
    keywords: ["аптека", "лікар", "pharmacy", "клінік", "стоматолог"],
  },
  {
    id: "shopping",
    label: "🛍 Покупки",
    mccs: [5311, 5331, 5651, 5661, 5699, 5732, 5734, 5945],
    keywords: ["rozetka", "amazon", "zara", "h&m", "reserved", "allo"],
  },
  {
    id: "entertainment",
    label: "🎮 Розваги",
    mccs: [7832, 7922, 7993, 7996, 7999],
    keywords: ["кіно", "cinema", "multiplex"],
  },
  {
    id: "sport",
    label: "🏋️ Спорт",
    mccs: [5941, 7941, 7997],
    keywords: ["спортмастер", "decathlon", "фітнес", "gym"],
  },
  {
    id: "beauty",
    label: "💅 Краса",
    mccs: [5977, 7230, 7297],
    keywords: ["салон", "перукар", "барбер", "манікюр"],
  },
  {
    id: "smoking",
    label: "🚬 Цигарки",
    mccs: [5993],
    keywords: [
      "iqos",
      "heet",
      "heets",
      "стік",
      "стіки",
      "cig",
      "cigarette",
      "тютюн",
      "цигар",
    ],
  },
  {
    id: "education",
    label: "📚 Навчання",
    mccs: [5942, 8220, 8299],
    keywords: ["книг", "курс", "udemy", "coursera"],
  },
  {
    id: "travel",
    label: "✈️ Подорожі",
    mccs: [3000, 4411, 4511, 7011, 7012],
    keywords: ["готель", "hotel", "airbnb", "booking", "aviasales", "авіа"],
  },
  {
    id: "debt",
    label: "🏦 Борги та кредити",
    mccs: [6012, 6051, 6099],
    keywords: [
      "погашення",
      "кредит",
      "позика",
      "розстрочка",
      "izibank",
      "credit",
      "loan",
      "борг",
    ],
  },
  {
    id: "charity",
    label: "💛 Благодійність",
    mccs: [8398, 8399],
    keywords: [
      "благодійн",
      "донат",
      "збір",
      "фонд",
      "помощь",
      "charity",
      "donate",
      "united24",
      "прапор",
      "savelife",
      "come back alive",
    ],
  },
  {
    id: INTERNAL_TRANSFER_ID,
    label: "↔️ Внутрішній переказ",
    mccs: [],
    keywords: [],
  },
];

/**
 * Мінімальна форма кастомної категорії, потрібна `mergeExpenseCategoryDefinitions`.
 * Keep loose — runtime payload може мати додаткові поля (emoji, color).
 */
export interface CustomCategoryInput {
  id: string;
  label?: string;
}

function isCustomCategoryInput(v: unknown): v is CustomCategoryInput {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id?: unknown }).id === "string"
  );
}

/** Базові категорії витрат + користувацькі (селекти, графіки). */
export function mergeExpenseCategoryDefinitions(
  customCategories: readonly unknown[] = [],
) {
  const base = MCC_CATEGORIES.filter((c) => c.id !== INTERNAL_TRANSFER_ID);
  const extra = customCategories.filter(isCustomCategoryInput).map((c) => ({
    id: c.id,
    label: c.label ?? "",
    mccs: [] as number[],
    keywords: [] as string[],
  }));
  return [...base, ...extra];
}

export const INCOME_CATEGORIES = [
  {
    id: "in_salary",
    label: "Зарплата",
    keywords: ["зарплата", "зп ", " зп", "аванс", "виплата", "salary"],
  },
  {
    id: "in_freelance",
    label: "Фріланс",
    keywords: ["upwork", "payoneer", "toptal", "freelance", "фріланс"],
  },
  { id: INTERNAL_TRANSFER_ID, label: "Внутрішній переказ", keywords: [] },
  {
    id: "in_cashback",
    label: "Кешбек",
    keywords: ["cashback", "кешбек", "бонус", "повернення"],
  },
  {
    id: "in_pension",
    label: "Пенсія/соц.",
    keywords: ["пенсія", "соц", "виплата держ", "допомога"],
  },
  { id: "in_other", label: "Надходження", keywords: [] },
];

export const DEFAULT_SUBSCRIPTIONS = [
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    emoji: "🤖",
    keyword: "openai",
    billingDay: 19,
    currency: "USD",
  },
  {
    id: "gmail",
    name: "Gmail 100GB",
    emoji: "📧",
    keyword: "google storage",
    billingDay: 11,
    currency: "USD",
  },
  {
    id: "gphotos",
    name: "Google Фото",
    emoji: "📸",
    keyword: "google one",
    billingDay: 29,
    currency: "USD",
  },
  {
    id: "icloud",
    name: "iCloud+ 200GB",
    emoji: "☁️",
    keyword: "icloud",
    billingDay: 17,
    currency: "USD",
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    emoji: "▶️",
    keyword: "youtube",
    billingDay: 12,
    currency: "UAH",
  },
  {
    id: "netflix",
    name: "Netflix",
    emoji: "🎬",
    keyword: "netflix",
    billingDay: 21,
    currency: "UAH",
  },
  {
    id: "spotify",
    name: "Spotify",
    emoji: "🎵",
    keyword: "spotify",
    billingDay: 29,
    currency: "UAH",
  },
];

export const PAGES = [
  { id: "overview", label: "🏠 Огляд" },
  { id: "transactions", label: "📋 Транзакції" },
  { id: "budgets", label: "📅 Планування" },
  { id: "analytics", label: "📊 Аналітика" },
  { id: "assets", label: "🏦 Активи та пасиви" },
];

export const CURRENCY = {
  UAH: 980,
  USD: 840,
  EUR: 978,
};

/** ISO-4217 numeric currency code → display symbol. Unknown codes are the
 *  caller's responsibility to fall back (defaults to `₴` in practice —
 *  every currency the app supports is one of the three keys above). */
export const CURRENCY_SYMBOL: Record<number, string> = {
  [CURRENCY.UAH]: "₴",
  [CURRENCY.USD]: "$",
  [CURRENCY.EUR]: "€",
};
