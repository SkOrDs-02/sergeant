// Pure-helpers для списку покупок: normalizeShoppingList (sanitize + dedup),
// toggleShoppingItem, removeCheckedItems, getCheckedItems, getTotalCount.
// Без `localStorage` / `window`; ID-фабрика всередині sanitizeItem використовує
// `Date.now()` + `Math.random()` — у дедуп-тестах достатньо перевіряти що ID
// унікальні (без точних значень).
import { describe, expect, it } from "vitest";

import {
  SHOPPING_LIST_KEY,
  getCheckedItems,
  getTotalCount,
  normalizeShoppingList,
  removeCheckedItems,
  toggleShoppingItem,
  type ShoppingList,
  type ShoppingListLike,
} from "./shoppingList.js";

describe("SHOPPING_LIST_KEY", () => {
  it("стабільний LS-key (зміна = міграція даних)", () => {
    expect(SHOPPING_LIST_KEY).toBe("nutrition_shopping_list_v1");
  });
});

describe("normalizeShoppingList", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "garbage"],
    ["number", 42],
    ["array", []],
  ])("повертає порожній список для %s", (_label, raw) => {
    expect(normalizeShoppingList(raw)).toEqual({ categories: [] });
  });

  it("повертає порожній список коли categories відсутні", () => {
    expect(normalizeShoppingList({})).toEqual({ categories: [] });
  });

  it("повертає порожній список коли categories не масив", () => {
    expect(normalizeShoppingList({ categories: "x" })).toEqual({
      categories: [],
    });
  });

  it("пропускає категорії, що не є об'єктами", () => {
    const r = normalizeShoppingList({
      categories: [
        null,
        "x",
        5,
        { name: "Овочі", items: [{ name: "Огірок" }] },
      ],
    });
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]!.name).toBe("Овочі");
  });

  it("підставляє 'Інше' для категорій без імені", () => {
    const r = normalizeShoppingList({
      categories: [{ items: [{ name: "Хліб" }] }],
    });
    expect(r.categories[0]!.name).toBe("Інше");
  });

  it("trim-ить ім'я категорії; whitespace-only теж дає 'Інше'", () => {
    const r = normalizeShoppingList({
      categories: [
        { name: "   ", items: [{ name: "Сіль" }] },
        { name: "  Молочне  ", items: [{ name: "Молоко" }] },
      ],
    });
    const names = r.categories.map((c) => c.name).sort();
    expect(names).toEqual(["Інше", "Молочне"].sort());
  });

  it("санітизує item: trim name, quantity, note; checked → Boolean", () => {
    const r = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [
            {
              id: "a1",
              name: "  Огірок  ",
              quantity: "  2 кг  ",
              note: "  свіжі  ",
              checked: 1,
            },
          ],
        },
      ],
    });
    expect(r.categories[0]!.items[0]).toEqual({
      id: "a1",
      name: "Огірок",
      quantity: "2 кг",
      note: "свіжі",
      checked: true,
    });
  });

  it("пропускає item-и без name або з пустим name", () => {
    const r = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [{ name: "" }, { name: "   " }, null, "x", { name: "Морква" }],
        },
      ],
    });
    expect(r.categories[0]!.items).toHaveLength(1);
    expect(r.categories[0]!.items[0]!.name).toBe("Морква");
  });

  it("видаляє категорії в яких після санітизації немає item-ів", () => {
    const r = normalizeShoppingList({
      categories: [
        { name: "Овочі", items: [{ name: "Огірок" }] },
        { name: "Молочне", items: [{ name: "" }, { name: "   " }] },
        { name: "Пусто", items: [] },
      ],
    });
    expect(r.categories.map((c) => c.name)).toEqual(["Овочі"]);
  });

  it("ігнорує items-поле, якщо воно не масив", () => {
    const r = normalizeShoppingList({
      categories: [{ name: "Овочі", items: "not-array" }],
    });
    expect(r.categories).toEqual([]);
  });

  it("генерує id для item-ів без id або з порожнім id", () => {
    const r = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [{ name: "Огірок" }, { id: "  ", name: "Помідор" }],
        },
      ],
    });
    const ids = r.categories[0]!.items.map((i) => i.id);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(id).toMatch(/^si_/);
    }
    expect(new Set(ids).size).toBe(2);
  });

  it("замінює id який вже використано в межах списку (повторний у різних категоріях)", () => {
    const r = normalizeShoppingList({
      categories: [
        { name: "Овочі", items: [{ id: "dup", name: "Огірок" }] },
        { name: "Фрукти", items: [{ id: "dup", name: "Яблуко" }] },
      ],
    });
    const idsByCat = r.categories.map((c) => c.items[0]!.id);
    expect(idsByCat).toHaveLength(2);
    expect(idsByCat[0]).toBe("dup");
    expect(idsByCat[1]).not.toBe("dup");
    expect(idsByCat[1]).toMatch(/^si_/);
  });

  it("обʼєднує дублікати в межах однієї категорії (за нормалізованим name)", () => {
    const r = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [
            { name: "Огірок", quantity: "" },
            { name: "  огірок  ", quantity: "2 кг" },
            { name: "ОГІРОК", note: "свіжі", checked: true },
            { name: "Помідор" },
          ],
        },
      ],
    });
    const items = r.categories[0]!.items;
    expect(items).toHaveLength(2);
    const cucumber = items.find((i) => i.name === "Огірок")!;
    expect(cucumber.quantity).toBe("2 кг");
    expect(cucumber.note).toBe("свіжі");
    expect(cucumber.checked).toBe(true);
  });

  it("обʼєднує дублікати name з різним whitespace в один рядок (\\s+ → ' ')", () => {
    const r = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [{ name: "Помідор чері" }, { name: "помідор   чері" }],
        },
      ],
    });
    expect(r.categories[0]!.items).toHaveLength(1);
  });

  it("обʼєднує дублікати name з різних категорій з однаковим ім'ям", () => {
    // Категорії з ідентичним name (з різним casing вони НЕ обʼєднуються —
    // дедуп тут case-sensitive). Тест перевіряє, що при exact-match назви
    // bucket reuse спрацьовує і items зливаються в одну категорію.
    const r = normalizeShoppingList({
      categories: [
        { name: "Овочі", items: [{ name: "Огірок" }] },
        { name: "Овочі", items: [{ name: "огірок", quantity: "1 кг" }] },
      ],
    });
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]!.items).toHaveLength(1);
    expect(r.categories[0]!.items[0]!.quantity).toBe("1 кг");
  });
});

describe("toggleShoppingItem", () => {
  const list: ShoppingList = {
    categories: [
      {
        name: "Овочі",
        items: [
          {
            id: "i1",
            name: "Огірок",
            quantity: "",
            note: "",
            checked: false,
          },
          { id: "i2", name: "Морква", quantity: "", note: "", checked: true },
        ],
      },
      {
        name: "Фрукти",
        items: [
          { id: "i3", name: "Яблуко", quantity: "", note: "", checked: false },
        ],
      },
    ],
  };

  it("перемикає checked у потрібному item", () => {
    const r = toggleShoppingItem(list, "Овочі", "i1");
    expect(r.categories[0]!.items[0]!.checked).toBe(true);
    expect(r.categories[0]!.items[1]!.checked).toBe(true);
  });

  it("перемикає checked з true → false", () => {
    const r = toggleShoppingItem(list, "Овочі", "i2");
    expect(r.categories[0]!.items[1]!.checked).toBe(false);
  });

  it("не змінює інші категорії", () => {
    const r = toggleShoppingItem(list, "Овочі", "i1");
    expect(r.categories[1]).toEqual(list.categories[1]);
  });

  it("повертає список без змін якщо немає такої категорії", () => {
    const r = toggleShoppingItem(list, "Інше", "i1");
    expect(r.categories).toEqual(list.categories);
  });

  it("повертає список без змін якщо немає такого item id", () => {
    const r = toggleShoppingItem(list, "Овочі", "missing");
    expect(r.categories[0]!.items).toEqual(list.categories[0]!.items);
  });

  it("підтримує null/undefined вхід", () => {
    expect(toggleShoppingItem(null, "Овочі", "i1")).toEqual({ categories: [] });
    expect(toggleShoppingItem(undefined, "Овочі", "i1")).toEqual({
      categories: [],
    });
  });

  it("підтримує category з відсутнім items-масивом", () => {
    const sparse: ShoppingListLike = {
      categories: [{ name: "Овочі" }, { name: "Інше", items: [] }],
    };
    const r = toggleShoppingItem(sparse, "Овочі", "i1");
    expect(r.categories[0]!.items).toEqual([]);
  });
});

describe("removeCheckedItems", () => {
  const list: ShoppingList = {
    categories: [
      {
        name: "Овочі",
        items: [
          {
            id: "i1",
            name: "Огірок",
            quantity: "",
            note: "",
            checked: false,
          },
          { id: "i2", name: "Морква", quantity: "", note: "", checked: true },
        ],
      },
      {
        name: "Фрукти",
        items: [
          { id: "i3", name: "Яблуко", quantity: "", note: "", checked: true },
        ],
      },
      {
        name: "Інше",
        items: [
          { id: "i4", name: "Сіль", quantity: "", note: "", checked: false },
        ],
      },
    ],
  };

  it("фільтрує checked-item-и в межах кожної категорії", () => {
    const r = removeCheckedItems(list);
    expect(r.categories).toHaveLength(2);
    expect(r.categories[0]!.name).toBe("Овочі");
    expect(r.categories[0]!.items.map((i) => i.id)).toEqual(["i1"]);
    expect(r.categories[1]!.name).toBe("Інше");
  });

  it("видаляє категорію, в якій після фільтра не лишилось item-ів", () => {
    const r = removeCheckedItems(list);
    const names = r.categories.map((c) => c.name);
    expect(names).not.toContain("Фрукти");
  });

  it("підтримує null/undefined вхід", () => {
    expect(removeCheckedItems(null)).toEqual({ categories: [] });
    expect(removeCheckedItems(undefined)).toEqual({ categories: [] });
  });

  it("підтримує category з відсутнім items-масивом", () => {
    const sparse: ShoppingListLike = { categories: [{ name: "Овочі" }] };
    const r = removeCheckedItems(sparse);
    expect(r.categories).toEqual([]);
  });
});

describe("getCheckedItems", () => {
  it("повертає лише checked item-и зі всіх категорій", () => {
    const list: ShoppingListLike = {
      categories: [
        {
          name: "Овочі",
          items: [
            { id: "i1", name: "Огірок", checked: false },
            { id: "i2", name: "Морква", checked: true },
          ],
        },
        {
          name: "Фрукти",
          items: [
            { id: "i3", name: "Яблуко", checked: true },
            { id: "i4", name: "Банан", checked: false },
          ],
        },
      ],
    };
    const r = getCheckedItems(list);
    expect(r.map((i) => i.id)).toEqual(["i2", "i3"]);
  });

  it("повертає [] якщо нічого не позначено", () => {
    const list: ShoppingListLike = {
      categories: [
        {
          name: "Овочі",
          items: [{ id: "i1", name: "Огірок", checked: false }],
        },
      ],
    };
    expect(getCheckedItems(list)).toEqual([]);
  });

  it("підтримує null/undefined вхід", () => {
    expect(getCheckedItems(null)).toEqual([]);
    expect(getCheckedItems(undefined)).toEqual([]);
  });

  it("підтримує category з відсутнім items-масивом", () => {
    const sparse: ShoppingListLike = { categories: [{ name: "Овочі" }] };
    expect(getCheckedItems(sparse)).toEqual([]);
  });
});

describe("getTotalCount", () => {
  it("рахує total + checked коректно у багатьох категоріях", () => {
    const list: ShoppingListLike = {
      categories: [
        {
          name: "Овочі",
          items: [
            { id: "i1", name: "Огірок", checked: false },
            { id: "i2", name: "Морква", checked: true },
            { id: "i3", name: "Цибуля", checked: true },
          ],
        },
        {
          name: "Фрукти",
          items: [{ id: "i4", name: "Яблуко", checked: false }],
        },
      ],
    };
    expect(getTotalCount(list)).toEqual({ total: 4, checked: 2 });
  });

  it("повертає нулі для null/undefined", () => {
    expect(getTotalCount(null)).toEqual({ total: 0, checked: 0 });
    expect(getTotalCount(undefined)).toEqual({ total: 0, checked: 0 });
  });

  it("повертає нулі для списку без item-ів", () => {
    expect(getTotalCount({ categories: [{ name: "Овочі" }] })).toEqual({
      total: 0,
      checked: 0,
    });
  });
});
