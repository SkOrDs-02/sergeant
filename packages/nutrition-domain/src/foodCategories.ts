export interface FoodCategory {
  id: string;
  label: string;
  /**
   * Імʼя гліфа дизайн-системи. До 2026-08-21 тут стояло емодзі
   * (`"🥕"`, `"🍎"`, …) — див. `mealTypes.ts` про причину заміни.
   */
  iconName: string;
  keywords: readonly string[];
  /**
   * Чи згортати назву з чека до родової (`genericFoodName`).
   *
   * Вимкнено там, де бренд змінює суть продукту: Red Bull це не Burn, а
   * «Кола Zero» не «Кола». У решті категорій бренд — шум, який плодить
   * дублі позицій.
   */
  collapseBrand: boolean;
}

export interface GroupedCategoryBucket<T = unknown> {
  cat: { id: string; label: string; iconName: string };
  items: Array<{ item: T; idx: number }>;
}

/**
 * AI-DANGER: ПОРЯДОК масиву — значуща частина поведінки, не косметика.
 * `categorizeFood` віддає ПЕРШИЙ збіг за ключовим словом, тож перестановка
 * записів мовчки перекидає продукти між категоріями. Порядок покритий
 * тестом (`foodCategories.test.ts` § «порядок каталогу»); ламаючи його,
 * ти ламаєш і тест.
 *
 * Чому саме такий порядок — три залежності, кожна з реального чека:
 *  - `sweets_snacks` перед `drinks`: «шоколад» містить підрядок «кола»;
 *  - `sauces` перед `nuts_seeds`: «Паста арахісова» — соус, не горіхи;
 *  - `nuts_seeds` перед `vegetables`: «Насіння Roni гарбуза» — не овоч;
 *  - `ready_meals` перед `meat_fish`: «Котлети курячі» — готова страва.
 */
export const FOOD_CATEGORIES: readonly FoodCategory[] = [
  {
    id: "sweets_snacks",
    label: "Солодощі та снеки",
    iconName: "sparkle",
    collapseBrand: false,
    keywords: [
      "цукерк",
      "шоколад",
      "печив",
      "вафл",
      "морозиво",
      "чіпс",
      // Сільпо друкує «Чипси» через «и», тож саме це написання й треба
      // ловити: назва в чеку не проходить нашу орфографію.
      "чипс",
      "грінк",
      "сухарик",
      "снек",
      "крекер",
      "мармелад",
      "зефір",
      "халва",
      "батончик",
      "тістечк",
      "жуйк",
      "попкорн",
    ],
  },
  {
    id: "drinks",
    label: "Напої та вода",
    iconName: "coffee",
    collapseBrand: false,
    keywords: [
      "напій",
      "вода",
      "сік",
      "кола",
      "лимонад",
      "пиво",
      "кава",
      "кави",
      "чай",
      "енергетик",
      "мінеральн",
      "смузі",
      "компот",
    ],
  },
  {
    id: "sauces",
    label: "Соуси та пасти",
    iconName: "bottle",
    collapseBrand: true,
    keywords: [
      "соус",
      "кетчуп",
      "майонез",
      "гірчиц",
      "паста",
      "песто",
      "хумус",
      "аджик",
      "тахін",
      "сальс",
      "теріякі",
    ],
  },
  {
    id: "nuts_seeds",
    label: "Горіхи та насіння",
    iconName: "leaf",
    collapseBrand: true,
    keywords: [
      "насіння",
      "горіх",
      "мигдал",
      "кешʼю",
      "кешью",
      "фісташ",
      "арахіс",
      "фундук",
      "кедров",
      "чіа",
      "кунжут",
    ],
  },
  {
    id: "ready_meals",
    label: "Готова кулінарія",
    iconName: "utensils",
    collapseBrand: true,
    keywords: [
      "котлет",
      "готов",
      "кулінар",
      "суші",
      "піц",
      "сендвіч",
      "шаурм",
      "бургер",
      "вареник",
      "пельмен",
      "голубц",
      "млинц",
      "деруни",
    ],
  },
  {
    id: "canned",
    label: "Консерви",
    iconName: "archive",
    collapseBrand: true,
    keywords: [
      "консерв",
      "тушонк",
      "шпрот",
      "маринован",
      "квашен",
      "оливки",
      "маслини",
      "паштет",
    ],
  },
  {
    id: "frozen",
    label: "Заморожене",
    iconName: "snowflake",
    collapseBrand: true,
    keywords: ["заморож", "морожен", "с/м"],
  },
  {
    id: "vegetables",
    label: "Овочі",
    iconName: "carrot",
    collapseBrand: true,
    keywords: [
      "огірок",
      "помідор",
      "томат",
      "морква",
      "цибул",
      "часник",
      "картопл",
      "капуст",
      "перец",
      "перц",
      "буряк",
      "кабачок",
      "кабачк",
      "баклажан",
      "броколі",
      "салат",
      "шпинат",
      "редис",
      "гарбуз",
      "зелен",
      "кукурудз",
      "квасол",
      "горошок",
      "чері",
    ],
  },
  {
    id: "fruits",
    label: "Фрукти та ягоди",
    iconName: "apple",
    collapseBrand: true,
    keywords: [
      "яблук",
      "груш",
      "банан",
      "апельсин",
      "мандарин",
      "лимон",
      "ківі",
      "виноград",
      "персик",
      "сливa",
      "слив",
      "полуниц",
      "чорниц",
      "малин",
      "смородин",
      "ананас",
      "диня",
      "кавун",
      "авокадо",
      "манго",
      "черешн",
      "вишн",
    ],
  },
  {
    id: "meat_fish",
    label: "Мʼясо та риба",
    iconName: "fish",
    collapseBrand: true,
    keywords: [
      "курк",
      "курч",
      "курин",
      "куряч",
      "індик",
      "індич",
      "свинин",
      "яловичин",
      "телятин",
      "баранин",
      "фарш",
      "ковбас",
      "сосиск",
      "шинк",
      "бекон",
      "сал",
      "лосос",
      "тунец",
      "тунць",
      "тунця",
      "форел",
      "риб",
      "креветк",
      "кальмар",
      "філе",
      "стейк",
      "грудк",
    ],
  },
  {
    id: "dairy_eggs",
    label: "Молочні та яйця",
    iconName: "egg",
    collapseBrand: true,
    keywords: [
      "молок",
      "кефір",
      "сметан",
      "йогурт",
      "сир",
      "творог",
      "масл",
      "вершк",
      "ряжанк",
      "яйц",
      "яєць",
      "фета",
      "моцарел",
      "пармезан",
    ],
  },
  {
    id: "grains",
    label: "Крупи та хліб",
    iconName: "wheat",
    collapseBrand: true,
    keywords: [
      "рис",
      "гречк",
      "вівсян",
      "овес",
      "кукурудз",
      "пшон",
      "манк",
      "макарон",
      "спагет",
      "хліб",
      "булочк",
      "лаваш",
      "борошн",
      "мук",
      "киноа",
      "кіноа",
      "булгур",
      "перловк",
      "пластівц",
      "тортил",
    ],
  },
  {
    id: "pantry",
    label: "Олії, спеції та бакалія",
    iconName: "droplet",
    collapseBrand: true,
    keywords: [
      "олі",
      "олія",
      "оливков",
      "оцет",
      "сіль",
      "сол",
      "цукор",
      "цукр",
      "мед",
      "спец",
      "перець мелен",
      "перц",
      "кориц",
      "ванілін",
      "сод",
      "розпушувач",
    ],
  },
];

const OTHER: FoodCategory = {
  id: "other",
  label: "Інше",
  iconName: "package",
  keywords: [],
  // Останній фолбек: якщо ми не впізнали продукт, то не впізнали й того,
  // що в його назві бренд, а що суть. Не чіпаємо назву взагалі.
  collapseBrand: false,
};

export function categorizeFood(name: unknown): FoodCategory {
  const n = String(name || "")
    .toLowerCase()
    .trim();
  if (!n) return OTHER;
  for (const cat of FOOD_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (n.includes(kw)) return cat;
    }
  }
  return OTHER;
}

export function groupItemsByCategory<T extends { name?: unknown }>(
  items: readonly T[] | unknown,
): Array<GroupedCategoryBucket<T>> {
  const buckets = new Map<string, GroupedCategoryBucket<T>>();
  for (const cat of FOOD_CATEGORIES) buckets.set(cat.id, { cat, items: [] });
  buckets.set(OTHER.id, { cat: OTHER, items: [] });

  const arr = (Array.isArray(items) ? items : []) as readonly T[];
  arr.forEach((it, idx) => {
    const cat = categorizeFood(it?.name);
    buckets.get(cat.id)?.items.push({ item: it, idx });
  });

  return [...buckets.values()].filter((b) => b.items.length > 0);
}
