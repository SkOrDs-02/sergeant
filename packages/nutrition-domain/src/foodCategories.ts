export interface FoodCategory {
  id: string;
  label: string;
  /**
   * Імʼя гліфа дизайн-системи. До 2026-08-21 тут стояло емодзі
   * (`"🥕"`, `"🍎"`, …) — див. `mealTypes.ts` про причину заміни.
   */
  iconName: string;
  keywords: readonly string[];
}

export interface GroupedCategoryBucket<T = unknown> {
  cat: { id: string; label: string; iconName: string };
  items: Array<{ item: T; idx: number }>;
}

export const FOOD_CATEGORIES: readonly FoodCategory[] = [
  {
    id: "vegetables",
    label: "Овочі",
    iconName: "carrot",
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
      "соус",
      "кетчуп",
      "майонез",
      "гірчиц",
    ],
  },
];

const OTHER: FoodCategory = {
  id: "other",
  label: "Інше",
  iconName: "package",
  keywords: [],
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
