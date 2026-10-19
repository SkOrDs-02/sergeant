import { describe, expect, it } from "vitest";

import { mergeItems } from "./mergeItems.js";
import { normalizePantries } from "./nutritionPantries.js";
import {
  legacyPositionalPantryItemId,
  newPantryItemId,
  resolvePantryItemIds,
} from "./pantryItemId.js";

describe("newPantryItemId", () => {
  it("видає унікальні id без прив'язки до позиції", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPantryItemId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).not.toContain("::");
  });
});

describe("resolvePantryItemIds (data-40)", () => {
  it("зберігає явні id незалежно від позиції та назви", () => {
    const ids = resolvePantryItemIds("home", [
      { id: "pi_a", name: "молоко" },
      { id: "pi_b", name: "хліб" },
    ]);
    expect(ids).toEqual(["pi_a", "pi_b"]);
  });

  it("видалення першої позиції НЕ змінює id решти", () => {
    const before = resolvePantryItemIds("home", [
      { id: "pi_a", name: "а" },
      { id: "pi_b", name: "б" },
      { id: "pi_c", name: "в" },
    ]);
    const after = resolvePantryItemIds("home", [
      { id: "pi_b", name: "б" },
      { id: "pi_c", name: "в" },
    ]);
    expect(after).toEqual([before[1], before[2]]);
  });

  it("позиція без id отримує легасі-id за позицією (= id її наявного рядка)", () => {
    expect(resolvePantryItemIds("home", [{ name: "молоко" }])).toEqual([
      legacyPositionalPantryItemId("home", 0, "молоко"),
    ]);
    expect(legacyPositionalPantryItemId("home", 0, "молоко")).toBe(
      "home::0::молоко",
    );
  });

  it("змішані версії: стара позиція без id + нова з id - без дублікатів", () => {
    const items = [
      { name: "молоко" }, // стара, без id
      { id: "pi_new", name: "кефір" }, // нова
      { name: "сир" }, // стара, без id
    ];
    const ids = resolvePantryItemIds("home", items);
    expect(ids).toEqual(["home::0::молоко", "pi_new", "home::2::сир"]);
    expect(new Set(ids).size).toBe(ids.length);
    // Повторний прохід (інший пристрій/версія клієнта) дає ті самі id.
    expect(resolvePantryItemIds("home", items)).toEqual(ids);
  });

  it("явний id має пріоритет над легасі-id безідової позиції з тим самим значенням", () => {
    const ids = resolvePantryItemIds("home", [
      { name: "молоко" },
      { id: "home::0::молоко", name: "інша" },
    ]);
    expect(ids[1]).toBe("home::0::молоко");
    expect(ids[0]).toBe("home::0::молоко#2");
    expect(new Set(ids).size).toBe(2);
  });

  it("дубль явного id в даних не породжує два однакових id", () => {
    const ids = resolvePantryItemIds("home", [
      { id: "pi_x", name: "а" },
      { id: "pi_x", name: "б" },
    ]);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("pi_x");
  });

  it("спільний набір `taken` робить id унікальними між місцями", () => {
    const taken = new Set<string>();
    const a = resolvePantryItemIds(
      "fridge",
      [{ id: "pi_x", name: "а" }],
      taken,
    );
    const b = resolvePantryItemIds("home", [{ id: "pi_x", name: "а" }], taken);
    expect(a).toEqual(["pi_x"]);
    expect(b[0]).not.toBe("pi_x");
  });
});

describe("id позицій у mergeItems / normalizePantries (data-40)", () => {
  it("нова позиція дістає id, наявна його зберігає", () => {
    const merged = mergeItems(
      [{ id: "pi_old", name: "молоко", qty: 1, unit: "л", notes: null }],
      [
        { name: "хліб", qty: 1, unit: "шт", notes: null },
        { name: "молоко", qty: 1, unit: "л", notes: null },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]!.id).toBe("pi_old");
    expect(merged[0]!.qty).toBe(2);
    expect(merged[1]!.id).toMatch(/^pi_/);
  });

  it("переїзд (позиція вже має id) зберігає id", () => {
    const merged = mergeItems(
      [],
      [{ id: "pi_moved", name: "сир", qty: 200, unit: "г", notes: null }],
    );
    expect(merged[0]!.id).toBe("pi_moved");
  });

  it("normalizePantries не губить id і не вигадує його", () => {
    const [p] = normalizePantries([
      {
        id: "home",
        name: "Комора",
        items: [
          { id: "pi_a", name: "молоко", qty: 1, unit: "л" },
          { name: "хліб", qty: 1, unit: "шт" },
        ],
      },
    ]);
    expect(p!.items[0]!.id).toBe("pi_a");
    expect("id" in p!.items[1]!).toBe(false);
  });
});
