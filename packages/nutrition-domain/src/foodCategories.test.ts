// Pure-helpers food-category classification: keyword-substring match через
// `categorizeFood` + bucketing у `groupItemsByCategory`. Тести зосереджені
// на (а) контракті каталогу `FOOD_CATEGORIES` (унікальні id, наявність
// emoji/label, обовʼязковий keyword), (б) поведінці класифікатора:
// порожній/негодящий input → "other", trim+lowercase, перший cat-match wins,
// (в) bucket-агрегатор зберігає порядок категорій + filter порожніх.
import { describe, expect, it } from "vitest";

import {
  FOOD_CATEGORIES,
  categorizeFood,
  groupItemsByCategory,
} from "./foodCategories.js";

describe("FOOD_CATEGORIES catalog", () => {
  it("має 6 базових категорій", () => {
    expect(FOOD_CATEGORIES).toHaveLength(6);
  });

  it("всі id унікальні", () => {
    const ids = FOOD_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("кожна категорія має label, emoji і хоча б один keyword", () => {
    for (const cat of FOOD_CATEGORIES) {
      expect(cat.label.length).toBeGreaterThan(0);
      expect(cat.emoji.length).toBeGreaterThan(0);
      expect(cat.keywords.length).toBeGreaterThan(0);
    }
  });

  it("експортує очікувані id-и (стабільний контракт для UI)", () => {
    expect(FOOD_CATEGORIES.map((c) => c.id)).toEqual([
      "vegetables",
      "fruits",
      "meat_fish",
      "dairy_eggs",
      "grains",
      "pantry",
    ]);
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
    expect(cat.emoji).toBe("📦");
  });

  it.each([
    ["Огірок", "vegetables"],
    ["помідор чері", "vegetables"],
    ["МОРКВА", "vegetables"],
    ["  цибуля  ", "vegetables"],
    ["яблуко", "fruits"],
    ["банани червоні", "fruits"],
    ["курка філе", "meat_fish"],
    ["свинина", "meat_fish"],
    ["молоко", "dairy_eggs"],
    ["сметана 20%", "dairy_eggs"],
    ["рис круглозернистий", "grains"],
    ["хліб бородинський", "grains"],
    ["олія соняшникова", "pantry"],
    ["сіль кам'яна", "pantry"],
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
    expect(categorizeFood("вода").id).toBe("other");
    expect(categorizeFood("якийсь невідомий продукт").id).toBe("other");
  });

  it("keyword працює як substring (часткове входження)", () => {
    // у 'fruits' є 'яблук' — слово 'яблука' має його як substring
    expect(categorizeFood("яблука").id).toBe("fruits");
    // 'курин' у meat_fish — 'куряча' НЕ містить 'курин' як substring,
    // але містить 'куряч' (також у словнику). Фіксуємо це.
    expect(categorizeFood("куряче філе").id).toBe("meat_fish");
  });

  it("non-string-like input (number, boolean, array) → 'other' через String() + lowercase", () => {
    // String(false) === 'false', String([]) === '' (порожній → other)
    expect(categorizeFood(false).id).toBe("other");
    expect(categorizeFood([]).id).toBe("other");
    // String(true) === 'true' → не містить жодного keyword
    expect(categorizeFood(true).id).toBe("other");
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
      "meat_fish",
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
    const items = [{ name: "вода" }, { name: "Огірок" }, { name: "інше щось" }];
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
