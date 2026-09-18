/**
 * Ukrainian-to-English food term translation map.
 *
 * Used by `food-search.ts` to translate the first token of a Ukrainian query
 * into an English equivalent for USDA / OFF-en search.
 *
 * Matches: exact token match, or prefix-match when token ≥ 3 chars
 * (e.g. "груш" → "груша" → "pear").
 */

export const UK_TO_EN: Record<string, string> = {
  груша: "pear",
  яблуко: "apple",
  банан: "banana",
  апельсин: "orange",
  лимон: "lemon",
  ківі: "kiwi",
  манго: "mango",
  персик: "peach",
  слива: "plum",
  вишня: "cherry",
  черешня: "cherry",
  полуниця: "strawberry",
  суниця: "strawberry",
  малина: "raspberry",
  чорниця: "blueberry",
  виноград: "grapes",
  гарбуз: "pumpkin",
  кабачок: "zucchini",
  баклажан: "eggplant",
  помідор: "tomato",
  томат: "tomato",
  огірок: "cucumber",
  морква: "carrot",
  цибуля: "onion",
  часник: "garlic",
  картопля: "potato",
  броколі: "broccoli",
  шпинат: "spinach",
  капуста: "cabbage",
  буряк: "beet",
  гриби: "mushrooms",
  шампіньони: "mushrooms",
  авокадо: "avocado",
  курка: "chicken",
  яловичина: "beef",
  свинина: "pork",
  лосось: "salmon",
  тунець: "tuna",
  яйце: "egg",
  молоко: "milk",
  сир: "cheese",
  йогурт: "yogurt",
  масло: "butter",
  рис: "rice",
  гречка: "buckwheat",
  вівсянка: "oatmeal",
  макарони: "pasta",
  хліб: "bread",
  мед: "honey",
  горіх: "nuts",
  арахіс: "peanut",
  мигдаль: "almond",
  кава: "coffee",
  чай: "tea",
  сочевиця: "lentils",
  квасоля: "beans",
  нут: "chickpeas",
  тофу: "tofu",
  ананас: "pineapple",
  диня: "melon",
  кавун: "watermelon",
  абрикос: "apricot",
  мандарин: "tangerine",
  грейпфрут: "grapefruit",
  родзинки: "raisins",
  чорнослив: "prunes",
  курага: "dried apricot",
  гарбузове: "pumpkin",
  цвітна: "cauliflower",
  селера: "celery",
  петрушка: "parsley",
  кріп: "dill",
  редиска: "radish",
  горошок: "peas",
  кукурудза: "corn",
  спаржа: "asparagus",
  гречане: "buckwheat",
  вівсяне: "oatmeal",
  пшениця: "wheat",
  кефір: "kefir",
  сметана: "sour cream",
  вершки: "cream",
  яловичий: "beef",
  курячий: "chicken",
  свинячий: "pork",
  рибний: "fish",
  риба: "fish",
  оселедець: "herring",
  скумбрія: "mackerel",
  тріска: "cod",
  форель: "trout",
  короп: "carp",
};

/**
 * Translate the first token of a Ukrainian food query to English.
 *
 * Performs exact match first, then prefix match (token ≥ 3 chars).
 * Returns `null` when no translation is found.
 */
export function translateFirstToken(query: string): string | null {
  const token = query.trim().toLowerCase().split(/\s+/)[0];
  if (!token || token.length < 2) return null;
  if (UK_TO_EN[token]) return UK_TO_EN[token];
  if (token.length >= 3) {
    for (const [key, val] of Object.entries(UK_TO_EN)) {
      if (key.startsWith(token)) return val;
    }
  }
  return null;
}
