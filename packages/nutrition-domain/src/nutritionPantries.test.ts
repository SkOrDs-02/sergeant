// Тести pure-помічників pantry: makeDefaultPantry, normalizePantries, updatePantry.
// `apps/web` тримає тільки I/O-обгортку — ця логіка має покриття до RN-портування.
import { describe, expect, it } from "vitest";

import {
  makeDefaultPantry,
  normalizePantries,
  updatePantry,
} from "./nutritionPantries.js";
import type { Pantry } from "./nutritionTypes.js";

describe("makeDefaultPantry", () => {
  it("повертає початковий 'home' Pantry з порожніми items + text", () => {
    const p = makeDefaultPantry();
    expect(p).toEqual({ id: "home", name: "Дім", items: [], text: "" });
  });

  it("кожен виклик дає НОВИЙ об'єкт (не shared reference)", () => {
    const a = makeDefaultPantry();
    const b = makeDefaultPantry();
    expect(a).not.toBe(b);
    a.items.push({ name: "x", qty: 1, unit: null, notes: null });
    expect(b.items).toEqual([]);
  });
});

describe("normalizePantries", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["object (not array)", { id: "x" }],
    ["string", "garbage"],
  ])("повертає [] для не-масиву (%s)", (_label, raw) => {
    expect(normalizePantries(raw)).toEqual([]);
  });

  it("парсить items: відкидає невалідні (нема name) і коерсить qty", () => {
    const res = normalizePantries([
      {
        id: "p1",
        name: "Кухня",
        items: [
          { name: "  Хліб  ", qty: 2, unit: "шт", notes: "цільнозерновий" },
          { name: "", qty: 1 }, // пустий name → drop
          { name: "Молоко", qty: "abc", unit: "л" }, // qty NaN → null
          { name: "Сир", qty: null, unit: undefined }, // qty null, unit null
          "garbage", // не object → drop
          null, // null → drop
        ],
      },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]!.name).toBe("Кухня");
    expect(res[0]!.items).toEqual([
      { name: "Хліб", qty: 2, unit: "шт", notes: "цільнозерновий" },
      { name: "Молоко", qty: null, unit: "л", notes: null },
      { name: "Сир", qty: null, unit: null, notes: null },
    ]);
  });

  it("дублікати id-ів отримують новий fallback id (p_<ts>_<idx>)", () => {
    const res = normalizePantries([
      { id: "home", name: "A", items: [] },
      { id: "home", name: "B", items: [] }, // duplicate → re-id
      { name: "C", items: [] }, // no id → re-id
    ]);
    expect(res).toHaveLength(3);
    expect(res[0]!.id).toBe("home");
    expect(res[1]!.id).not.toBe("home");
    expect(res[1]!.id).toMatch(/^p_\d+_\d+$/);
    expect(res[2]!.id).toMatch(/^p_\d+_\d+$/);
    expect(res[1]!.id).not.toBe(res[2]!.id); // index-частина різна
  });

  it("name відсутній → 'Склад' (не пустий рядок)", () => {
    expect(normalizePantries([{ id: "p1", items: [] }])).toMatchObject([
      { name: "Склад" },
    ]);
    expect(
      normalizePantries([{ id: "p1", name: "   ", items: [] }]),
    ).toMatchObject([{ name: "Склад" }]);
  });

  it("text == null → '' (не лишає undefined у State)", () => {
    expect(
      normalizePantries([{ id: "p1", name: "X", items: [] }]),
    ).toMatchObject([{ text: "" }]);
  });

  it("items не масив → []", () => {
    expect(
      normalizePantries([{ id: "p1", name: "X", items: "garbage" }]),
    ).toMatchObject([{ items: [] }]);
  });
});

describe("updatePantry", () => {
  const items: Pantry[] = [
    { id: "home", name: "Дім", items: [], text: "" },
    { id: "office", name: "Офіс", items: [], text: "lunch" },
  ];

  it("оновлює існуючий pantry за id", () => {
    const next = updatePantry(items, "office", (p) => ({
      ...p,
      text: "snack",
    }));
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(items[0]); // home без змін
    expect(next[1]!.text).toBe("snack");
    // immutability: оригінал не модифіковано
    expect(items[1]!.text).toBe("lunch");
  });

  it("створює дефолтний 'home' коли activeId не знайдено + ставить його першим", () => {
    const next = updatePantry(items, "missing-id", (p) => ({
      ...p,
      text: "fresh",
    }));
    expect(next).toHaveLength(3);
    expect(next[0]).toEqual({
      id: "home",
      name: "Дім",
      items: [],
      text: "fresh",
    });
    expect(next[1]).toEqual(items[0]);
    expect(next[2]).toEqual(items[1]);
  });

  it("activeId == null/undefined → fallback 'home'", () => {
    expect(updatePantry([], null, (p) => p)[0]).toMatchObject({ id: "home" });
    expect(updatePantry([], undefined, (p) => p)[0]).toMatchObject({
      id: "home",
    });
  });

  it("pantries не масив → стартує з [makeDefaultPantry()]", () => {
    const next = updatePantry(null as unknown as Pantry[], "home", (p) => ({
      ...p,
      text: "init",
    }));
    expect(next).toEqual([
      { id: "home", name: "Дім", items: [], text: "init" },
    ]);
  });
});
