// Pure-helpers food-category classification: keyword-substring match через
// `categorizeFood` + bucketing у `groupItemsByCategory`. Тести зосереджені
// на (а) контракті каталогу `FOOD_CATEGORIES` (унікальні id, наявність
// iconName/label, обовʼязковий keyword), (б) поведінці класифікатора:
// порожній/негодящий input → "other", trim+lowercase, перший cat-match wins,
// (в) bucket-агрегатор зберігає порядок категорій + filter порожніх.
import { GENERIC_FOODS } from "@sergeant/shared/data/genericFoods";
import { describe, expect, it } from "vitest";

import {
  CORPUS_CATEGORY_TO_ID,
  FOOD_CATEGORIES,
  categorizeFood,
  groupItemsByCategory,
} from "./foodCategories.js";

describe("FOOD_CATEGORIES catalog", () => {
  it("має 17 базових категорій", () => {
    expect(FOOD_CATEGORIES).toHaveLength(17);
  });

  it("всі id унікальні", () => {
    const ids = FOOD_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("кожна категорія має label, iconName і хоча б один keyword", () => {
    for (const cat of FOOD_CATEGORIES) {
      expect(cat.label.length).toBeGreaterThan(0);
      expect(cat.iconName.length).toBeGreaterThan(0);
      expect(cat.keywords.length).toBeGreaterThan(0);
    }
  });

  // Регресія на репорт тестувальника 2026-08-21: гліфи категорій були
  // емодзі, тож малювались системним шрифтом — по-різному на кожній ОС,
  // без кольору й теми. Тепер це імена іконок дизайн-системи.
  it("жодна категорія не несе емодзі", () => {
    for (const cat of FOOD_CATEGORIES) {
      expect(/\p{Extended_Pictographic}/u.test(cat.label), cat.id).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(cat.iconName), cat.id).toBe(
        false,
      );
    }
  });

  it("експортує очікувані id-и (стабільний контракт для UI)", () => {
    expect(FOOD_CATEGORIES.map((c) => c.id)).toEqual([
      "sweets_snacks",
      "drinks",
      "ready_meals",
      "sauces",
      "nuts_seeds",
      "canned",
      "frozen",
      "vegetables",
      "legumes",
      "fruits",
      "alcohol",
      "fish",
      "meat",
      "dairy_eggs",
      "grains",
      "sports",
      "pantry",
    ]);
  });

  // AI-DANGER: порядок каталогу — поведінка, не косметика. Кожна пара нижче
  // взята з реального чека Сільпо: переставиш записи — продукт мовчки
  // переїде в чужу категорію.
  it.each([
    ["sweets_snacks", "drinks", "«шоколад» містить підрядок «кола»"],
    ["ready_meals", "sauces", "«Удон з куркою в соусі терияки» — це удон"],
    ["sauces", "nuts_seeds", "«Паста арахісова» — соус, не горіхи"],
    ["nuts_seeds", "vegetables", "«Насіння Roni гарбуза» — не овоч"],
    ["ready_meals", "meat", "«Котлети курячі» — готова страва"],
    ["fruits", "alcohol", "корінь «вино» стоїть на початку «виноград»"],
    ["fish", "meat", "«філе» належить мʼясу, тож «Філе лосося» — риба"],
  ])("%s стоїть перед %s (%s)", (first, second) => {
    const ids = FOOD_CATEGORIES.map((c) => c.id);
    expect(ids.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(first)).toBeLessThan(ids.indexOf(second));
  });

  it("згортання бренду вимкнене там, де бренд змінює суть продукту", () => {
    const byId = new Map(FOOD_CATEGORIES.map((c) => [c.id, c]));
    expect(byId.get("drinks")!.collapseBrand).toBe(false);
    expect(byId.get("sweets_snacks")!.collapseBrand).toBe(false);
    // Конкретне вино і конкретний протеїн — різні товари, як Red Bull і Burn.
    expect(byId.get("alcohol")!.collapseBrand).toBe(false);
    expect(byId.get("sports")!.collapseBrand).toBe(false);
    expect(categorizeFood("щось геть невпізнаване").collapseBrand).toBe(false);
    for (const id of [
      "nuts_seeds",
      "frozen",
      "canned",
      "sauces",
      "ready_meals",
      "fish",
      "legumes",
    ]) {
      expect(byId.get(id)!.collapseBrand, id).toBe(true);
    }
  });
});

describe("categorizeFood", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "    "],
    ["number 0", 0],
    ["object", {}],
  ])("повертає 'other' для %s", (_label, raw) => {
    const cat = categorizeFood(raw);
    expect(cat.id).toBe("other");
    expect(cat.label).toBe("Інше");
    expect(cat.iconName).toBe("package");
  });

  it.each([
    ["Огірок", "vegetables"],
    ["помідор чері", "vegetables"],
    ["МОРКВА", "vegetables"],
    ["  цибуля  ", "vegetables"],
    ["яблуко", "fruits"],
    ["банани червоні", "fruits"],
    ["курка філе", "meat"],
    ["свинина", "meat"],
    ["молоко", "dairy_eggs"],
    ["сметана 20%", "dairy_eggs"],
    ["рис круглозернистий", "grains"],
    ["хліб бородинський", "grains"],
    ["олія соняшникова", "pantry"],
    ["сіль камʼяна", "pantry"],
  ])("'%s' → %s", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });

  it("trim + lowercase до перевірки keyword", () => {
    expect(categorizeFood("  Помідор ЧЕРІ  ").id).toBe("vegetables");
  });

  it("перший cat у каталозі, чий keyword знайдено в name — wins (vegetables перед grains для 'кукурудз')", () => {
    // keyword 'кукурудз' є і у vegetables (позиція 0), і у grains (позиція 4).
    // Класифікатор bере перший по порядку FOOD_CATEGORIES.
    expect(categorizeFood("кукурудза").id).toBe("vegetables");
  });

  it("повертає 'other' коли name не містить жодного keyword", () => {
    expect(categorizeFood("серветки").id).toBe("other");
    expect(categorizeFood("якийсь невідомий продукт").id).toBe("other");
  });

  // Дефект, який ця спека виправляє: «гарбуз» стоїть у ключових словах
  // `vegetables`, тож насіння гарбуза лежало в Овочах.
  it.each([
    ["Насіння Roni гарбуза", "nuts_seeds"],
    ["Паста арахісова Лавка традицій Aumi кранч", "sauces"],
    ["Котлети курячі з кускусом", "ready_meals"],
    ["Напій енергетичний Red Bull", "drinks"],
    ["Шоколад молочний", "sweets_snacks"],
    ["Кока-Кола Zero", "drinks"],
    ["Оливки зелені без кісточки", "canned"],
    ["Овочі заморожені", "frozen"],
  ])("'%s' → %s", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });

  // Звіт власника 2026-08-31: чипси й грінки лежали в «Соусах та пастах».
  // Дві причини разом: снек-категорія не знала написання з чека Сільпо
  // («Чипси» через «и», «Грінки», «Сухарики»), а хвіст «зі смаком …» несе
  // слова, які ловлять інші категорії. Голова назви має вигравати хвіст —
  // це працює само собою, бо `categorizeFood` перебирає КАТЕГОРІЇ зовнішнім
  // циклом, а `sweets_snacks` стоїть першою.
  it.each([
    ["Чипси креветкові зі смаком соусу чилі", "sweets_snacks"],
    ["Грінки житні зі смаком сметани та зелені", "sweets_snacks"],
    ["Сухарики пшеничні зі смаком томатної пасти", "sweets_snacks"],
  ])(
    "'%s' → %s (смак у хвості не перекидає категорію)",
    (input, expectedId) => {
      expect(categorizeFood(input).id).toBe(expectedId);
    },
  );

  // Нові ключові слова легко ловлять чужі продукти як підрядок — ці пари
  // ловились під час розробки і лишаються сторожами.
  it.each([
    ["Виноград", "fruits"],
    // Квасоля переїхала з Овочів у власну категорію Бобові разом із
    // каталогом 13 → 17; сторож лишається, змінилась лише очікувана ціль.
    ["Квасоля червона", "legumes"],
    ["Олія соняшникова", "pantry"],
    ["Тортилья пшенична", "grains"],
    ["Олія оливкова", "pantry"],
    ["Кавун", "fruits"],
  ])("'%s' не перехоплюється новою категорією → %s", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });

  it("keyword працює як substring (часткове входження)", () => {
    // у 'fruits' є 'яблук' — слово 'яблука' має його як substring
    expect(categorizeFood("яблука").id).toBe("fruits");
    // 'курин' у meat — 'куряча' НЕ містить 'курин' як substring,
    // але містить 'куряч' (також у словнику). Фіксуємо це.
    expect(categorizeFood("куряче філе").id).toBe("meat");
  });

  it("non-string-like input (number, boolean, array) → 'other' через String() + lowercase", () => {
    // String(false) === 'false', String([]) === '' (порожній → other)
    expect(categorizeFood(false).id).toBe("other");
    expect(categorizeFood([]).id).toBe("other");
    // String(true) === 'true' → не містить жодного keyword
    expect(categorizeFood(true).id).toBe("other");
  });
});

// ── Гейт 1: повне покриття кураторського корпусу ────────────────────
//
// Механічний аудит 2026-08-31 прогнав усі позиції `GENERIC_FOODS` через
// тодішній `categorizeFood`: 30% падали в «Інше», ще вісім отримували
// хибну категорію через короткий корінь у чужому слові («г-риб-и» →
// риба). Цей гейт робить той самий прогін частиною CI, тож нова позиція
// корпусу без даху червонить збірку одразу, а не через місяць у UI.
describe("гейт 1 — корпус GENERIC_FOODS покритий цілком", () => {
  it("кожна категорія корпусу має відповідник у каталозі комори", () => {
    const known = new Set(FOOD_CATEGORIES.map((c) => c.id));
    const unmapped = [...new Set(GENERIC_FOODS.map((f) => f.category))].filter(
      (c) => !CORPUS_CATEGORY_TO_ID[c],
    );
    expect(unmapped).toEqual([]);

    const danglingTargets = Object.entries(CORPUS_CATEGORY_TO_ID)
      .filter(([, id]) => !known.has(id))
      .map(([corpus, id]) => `${corpus} → ${id}`);
    expect(danglingTargets).toEqual([]);
  });

  it("жодна позиція корпусу не падає в «Інше» і не суперечить корпусу", () => {
    const wrong = GENERIC_FOODS.map((food) => {
      const expected =
        food.alcohol_g != null
          ? "alcohol"
          : CORPUS_CATEGORY_TO_ID[food.category];
      const actual = categorizeFood(food.name).id;
      return actual === expected
        ? null
        : `${food.name} (${food.category}): очікували ${expected}, отримали ${actual}`;
    }).filter(Boolean);
    expect(wrong).toEqual([]);
  });
});

// ── Гейт 2: живі назви з чеків Сільпо ────────────────────────────────
//
// Корпус стереже кураторську базу, цей набір — полицю. Бренд-назви в
// корпусі немає й не буде, тож тут працює гілка ключових слів, і саме
// вона колись клала чипси в соуси.
describe("гейт 2 — брендові назви з реальних чеків", () => {
  it.each([
    ["Чипси креветкові зі смаком соусу чилі", "sweets_snacks"],
    ["Грінки житні зі смаком сметани та зелені", "sweets_snacks"],
    ["Насіння Roni гарбуза", "nuts_seeds"],
    ["Паста арахісова Лавка традицій Aumi кранч", "sauces"],
    ["Гриби печериці мариновані", "canned"],
    ["Молоко Яготинське 2.6% 900г", "dairy_eggs"],
    ["Філе лосося охолоджене", "fish"],
    ["Оселедець філе-шматочки в олії", "fish"],
    ["Вино Шабо червоне сухе 0.75л", "alcohol"],
    ["Пиво Львівське світле 0.5л", "alcohol"],
    ["Протеїн Olimp Whey 900г", "sports"],
    ["Сочевиця червона Терра 400г", "legumes"],
    ["Гриби шампіньйони свіжі 400г", "vegetables"],
    ["Руккола свіжа 65г", "vegetables"],
    ["Чіабата пшенична", "grains"],
    ["Торт Медовик Київхліб", "sweets_snacks"],
  ])("'%s' → %s", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });

  // Знайдено прогоном 94 унікальних назв із реальних чеків Сільпо
  // (`silpo_receipt_items`, 2026-08-31). Кожен рядок — дефект, який той
  // прогін показав, і кожен лікувався своїм способом: синонімом корпусу,
  // новим коренем або порядком каталогу.
  it.each([
    ["Яйця курячі Квочка XL відбірні СВ", "dairy_eggs"],
    ["Йогурт Галичина Карпатський чорниця 2,2%", "dairy_eggs"],
    ["Йогурт Дольче манго 2,5%", "dairy_eggs"],
    ["Гумка жувальна Dirol кавунно-динний коктейль", "sweets_snacks"],
    ["Паляничка сирна", "grains"],
    ["Сніданок Good morning, Granola To Go з журавлиною", "grains"],
    ["Удон з куркою та печерицями в соусі терияки", "ready_meals"],
    ["Онігірі з куркою та соусом кімчі", "ready_meals"],
    ["Рол з сосискою", "ready_meals"],
    ["Курячий шашлик з ананасом", "meat"],
    ["Холодник зі свининою та вареною ковбасою", "ready_meals"],
    ["Айран Премія 1,8% пл", "dairy_eggs"],
    ["Форель, стейк охолоджений", "fish"],
    ["Хліб Сумська Паляниця Grains тостовий нарізний", "grains"],
  ])("'%s' → %s (регресія з живого чека)", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });

  // Не-їжа з того самого чека мусить лишатись в «Іншому»: категорія,
  // вигадана для сигарет, читається як поламаний застосунок.
  it.each([
    "Сигарети Parliament Aqua Blue з фільтром",
    "Батарейка Премія AA LR06",
    "Виріб тютюновий д/елек нагр Terea Sun Pearl",
  ])("'%s' лишається в «Іншому»", (input) => {
    expect(categorizeFood(input).id).toBe("other");
  });

  // Рядки з клік-скрипта спеки — по представнику кожної нової категорії
  // саме в тому вигляді, як їх набирають у полі «По одному».
  it.each([
    ["Оселедець 200 г", "fish"],
    ["Сочевиця 300 г", "legumes"],
    ["Вино сухе 750 мл", "alcohol"],
    ["Креатин 300 г", "sports"],
  ])("'%s' → %s (поле «По одному»)", (input, expectedId) => {
    expect(categorizeFood(input).id).toBe(expectedId);
  });
});

describe("groupItemsByCategory", () => {
  it("повертає [] якщо items не масив", () => {
    expect(groupItemsByCategory(null)).toEqual([]);
    expect(groupItemsByCategory(undefined)).toEqual([]);
    expect(groupItemsByCategory("not-array")).toEqual([]);
    expect(groupItemsByCategory({ a: 1 })).toEqual([]);
  });

  it("повертає [] для порожнього масиву (всі buckets фільтруються як empty)", () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });

  it("групує item-и по правильних категоріях, зберігаючи порядок з FOOD_CATEGORIES", () => {
    const items = [
      { name: "Огірок" },
      { name: "Яблуко" },
      { name: "Морква" },
      { name: "Курка" },
    ];
    const groups = groupItemsByCategory(items);
    expect(groups.map((g) => g.cat.id)).toEqual([
      "vegetables",
      "fruits",
      "meat",
    ]);
    // vegetables bucket має 2 item-и; перший — Огірок (idx 0), другий — Морква (idx 2)
    const veg = groups[0]!;
    expect(veg.items.map((x) => x.idx)).toEqual([0, 2]);
    expect(veg.items.map((x) => (x.item as { name: string }).name)).toEqual([
      "Огірок",
      "Морква",
    ]);
  });

  it("неперекласифікований item потрапляє у 'other' bucket (зберігається в кінці порядку)", () => {
    const items = [
      { name: "серветки" },
      { name: "Огірок" },
      { name: "інше щось" },
    ];
    const groups = groupItemsByCategory(items);
    const ids = groups.map((g) => g.cat.id);
    expect(ids).toContain("vegetables");
    expect(ids).toContain("other");
    expect(ids[ids.length - 1]).toBe("other");
    const other = groups.find((g) => g.cat.id === "other")!;
    expect(other.items.map((x) => x.idx)).toEqual([0, 2]);
  });

  it("item без name (або з не-string name) → 'other'", () => {
    interface Item {
      name?: unknown;
    }
    const items: Item[] = [{}, { name: null }, { name: 42 }];
    const groups = groupItemsByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cat.id).toBe("other");
    expect(groups[0]!.items).toHaveLength(3);
  });

  it("item-и зберігають оригінальний idx (порядок до групування)", () => {
    const items = [
      { name: "Яблуко" }, // idx 0 → fruits
      { name: "Огірок" }, // idx 1 → vegetables
      { name: "Банан" }, // idx 2 → fruits
    ];
    const groups = groupItemsByCategory(items);
    const fruits = groups.find((g) => g.cat.id === "fruits")!;
    expect(fruits.items.map((x) => x.idx)).toEqual([0, 2]);
  });

  it("nullish item у вхідному масиві не падає; класифікується як 'other'", () => {
    // arr.forEach викликає `categorizeFood(it?.name)`. Для it === null,
    // `it?.name` → undefined → categorizeFood → 'other'.
    const items = [null, { name: "Огірок" }, undefined];
    const groups = groupItemsByCategory(items as never);
    expect(groups.map((g) => g.cat.id).sort()).toEqual(["other", "vegetables"]);
  });
});
