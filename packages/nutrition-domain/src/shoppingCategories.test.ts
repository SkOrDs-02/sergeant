// Одна таксономія для списку покупок і комори (рішення власника 2026-10-01,
// n3): категорії списку - це категорії комори; старі назви, які просив у
// моделі промпт до цієї дати, зводяться до нових, а збережені раніше списки
// мігрують при читанні.
import { describe, expect, it } from "vitest";

import { FOOD_CATEGORIES } from "./foodCategories.js";
import {
  SHOPPING_CATEGORIES,
  findShoppingCategory,
  migrateShoppingListCategories,
  resolveShoppingCategory,
} from "./shoppingCategories.js";

describe("SHOPPING_CATEGORIES", () => {
  it("це категорії комори плюс «Інше» в кінці, без власного переліку", () => {
    expect(SHOPPING_CATEGORIES.slice(0, FOOD_CATEGORIES.length)).toEqual([
      ...FOOD_CATEGORIES,
    ]);
    expect(SHOPPING_CATEGORIES.at(-1)?.id).toBe("other");
    expect(SHOPPING_CATEGORIES).toHaveLength(FOOD_CATEGORIES.length + 1);
  });

  it("мітки унікальні й не містять довгого тире (промпт їх друкує)", () => {
    const labels = SHOPPING_CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).not.toContain("—");
  });
});

describe("findShoppingCategory", () => {
  it.each([
    ["Молочні та яйця", "dairy_eggs"],
    ["молочні та яйця", "dairy_eggs"],
    ["  Молочні   та яйця  ", "dairy_eggs"],
    ["«Овочі»", "vegetables"],
    ["dairy_eggs", "dairy_eggs"],
    // Три види апострофа: модель друкує не завжди той, що в каталозі.
    ["Мʼясо та птиця", "meat"],
    ["М'ясо та птиця", "meat"],
    ["М’ясо та птиця", "meat"],
    ["Спреди та намазки", "spreads"],
    ["Інше", "other"],
  ])("'%s' → %s", (name, expectedId) => {
    expect(findShoppingCategory(name)?.id).toBe(expectedId);
  });

  it("старі й невідомі назви - не категорії комори", () => {
    expect(findShoppingCategory("Хлібобулочні вироби")).toBeNull();
    expect(findShoppingCategory("Закінчується вдома")).toBeNull();
    expect(findShoppingCategory("")).toBeNull();
    expect(findShoppingCategory(null)).toBeNull();
  });
});

describe("resolveShoppingCategory", () => {
  it("мітка чи id комори перемагає назву позиції", () => {
    expect(resolveShoppingCategory("Овочі", "Молоко").id).toBe("vegetables");
    expect(resolveShoppingCategory("dairy_eggs", "Огірок").id).toBe(
      "dairy_eggs",
    );
  });

  // Одинадцять назв, які просив у моделі промпт до 2026-10-01.
  it.each([
    ["Молочні продукти", "Кефір", "dairy_eggs"],
    ["Овочі та гриби", "Печериці", "vegetables"],
    ["Фрукти", "Яблука", "fruits"],
    ["Крупи та злаки", "Рис", "grains"],
    ["Хлібобулочні вироби", "Батон", "grains"],
    ["Яйця", "Яйця", "dairy_eggs"],
    ["Олії та жири", "Олія соняшникова", "pantry"],
    ["Напої", "Сік", "drinks"],
    ["Інше", "Серветки", "other"],
  ])("стара «%s» + «%s» → %s", (legacy, item, expectedId) => {
    expect(resolveShoppingCategory(legacy, item).id).toBe(expectedId);
  });

  it("стара «Мʼясо та риба» ділиться за позицією: риба йде в рибу", () => {
    expect(resolveShoppingCategory("Мʼясо та риба", "Лосось").id).toBe("fish");
    expect(resolveShoppingCategory("М'ясо та риба", "Креветки").id).toBe(
      "fish",
    );
    expect(resolveShoppingCategory("Мʼясо та риба", "Куряче філе").id).toBe(
      "meat",
    );
  });

  it("позиція, якої комора не віднесла ні до мʼяса, ні до риби, лишається в мʼясі", () => {
    expect(resolveShoppingCategory("Мʼясо та риба", "Тофу").id).toBe("meat");
  });

  it("стара «Приправи та соуси» ділиться між бакалією, соусами й спредами", () => {
    expect(resolveShoppingCategory("Приправи та соуси", "Кетчуп").id).toBe(
      "sauces",
    );
    expect(resolveShoppingCategory("Приправи та соуси", "Сіль").id).toBe(
      "pantry",
    );
    expect(
      resolveShoppingCategory("Приправи та соуси", "Паста арахісова").id,
    ).toBe("spreads");
    // Позиція з чужої категорії не тягне за собою: лишається за замовчуванням.
    expect(resolveShoppingCategory("Приправи та соуси", "Огірок").id).toBe(
      "pantry",
    );
  });

  it("невідома чи порожня назва → категорія за назвою позиції, інакше «Інше»", () => {
    expect(resolveShoppingCategory("", "Кефір").id).toBe("dairy_eggs");
    expect(resolveShoppingCategory(undefined, "Огірок").id).toBe("vegetables");
    expect(resolveShoppingCategory("Заморожені продукти", "Пельмені").id).toBe(
      "ready_meals",
    );
    expect(resolveShoppingCategory("Щось своє", "Серветки").id).toBe("other");
    expect(resolveShoppingCategory("Щось своє").id).toBe("other");
  });
});

function item(
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, name, quantity: "", note: "", checked: false, ...extra };
}

describe("migrateShoppingListCategories", () => {
  it("мігрує збережений список зі старими назвами в категорії комори", () => {
    const migrated = migrateShoppingListCategories({
      categories: [
        {
          name: "Мʼясо та риба",
          items: [item("a", "Лосось"), item("b", "Куряче філе")],
        },
        { name: "Молочні продукти", items: [item("c", "Кефір")] },
        {
          name: "Яйця",
          items: [item("d", "Яйця", { checked: true, quantity: "10 шт" })],
        },
        {
          name: "Овочі та гриби",
          items: [item("e", "Печериці", { source: "manual" })],
        },
      ],
    });

    expect(migrated.categories.map((c) => c.name)).toEqual([
      "Риба та морепродукти",
      "Мʼясо та птиця",
      "Молочні та яйця",
      "Овочі",
    ]);
    // Дві старі групи злились в одну; id, галочка, кількість, походження живі.
    const dairy = migrated.categories.find((c) => c.name === "Молочні та яйця");
    expect(dairy?.items.map((i) => i.id)).toEqual(["c", "d"]);
    expect(dairy?.items[1]).toMatchObject({ checked: true, quantity: "10 шт" });
    const veg = migrated.categories.find((c) => c.name === "Овочі");
    expect(veg?.items[0]).toMatchObject({ id: "e", source: "manual" });
  });

  it("зливає дублі за назвою, що опинились в одній новій групі", () => {
    const migrated = migrateShoppingListCategories({
      categories: [
        { name: "Молочні продукти", items: [item("a", "Яйця")] },
        {
          name: "Яйця",
          items: [item("b", "яйця", { quantity: "6 шт", checked: true })],
        },
      ],
    });
    expect(migrated.categories).toHaveLength(1);
    const only = migrated.categories[0];
    expect(only?.name).toBe("Молочні та яйця");
    expect(only?.items).toHaveLength(1);
    expect(only?.items[0]).toMatchObject({ quantity: "6 шт", checked: true });
  });

  it("список, що вже в категоріях комори, не рухається (ідемпотентність)", () => {
    const list = {
      categories: [
        { name: "Овочі", items: [item("a", "Огірок")] },
        { name: "Інше", items: [item("b", "Серветки")] },
      ],
    };
    const once = migrateShoppingListCategories(list);
    expect(once.categories.map((c) => c.name)).toEqual(["Овочі", "Інше"]);
    expect(migrateShoppingListCategories(once)).toEqual(once);
  });

  it("мітку в іншому регістрі чи id зводить до канонічної мітки", () => {
    const migrated = migrateShoppingListCategories({
      categories: [
        { name: "овочі", items: [item("a", "Огірок")] },
        { name: "dairy_eggs", items: [item("b", "Кефір")] },
      ],
    });
    expect(migrated.categories.map((c) => c.name)).toEqual([
      "Овочі",
      "Молочні та яйця",
    ]);
  });

  it("невідома категорія розкладає позиції за їхніми назвами", () => {
    const migrated = migrateShoppingListCategories({
      categories: [
        {
          name: "Різне",
          items: [item("a", "Огірок"), item("b", "Серветки")],
        },
      ],
    });
    expect(
      migrated.categories.map((c) => [c.name, c.items.map((i) => i.id)]),
    ).toEqual([
      ["Овочі", ["a"]],
      ["Інше", ["b"]],
    ]);
  });

  it("порожнє й сміття дають порожній список", () => {
    expect(migrateShoppingListCategories(null)).toEqual({ categories: [] });
    expect(migrateShoppingListCategories(undefined)).toEqual({
      categories: [],
    });
    expect(migrateShoppingListCategories({ categories: [] })).toEqual({
      categories: [],
    });
  });
});
