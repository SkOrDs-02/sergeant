import { describe, expect, it } from "vitest";
import { mergeItems } from "./mergeItems.js";

describe("mergeItems", () => {
  it("adds new distinct items", () => {
    const out = mergeItems(
      [{ name: "яйця", qty: null, unit: null }],
      [{ name: "рис" }],
    );
    expect(out.map((x) => x.name)).toEqual(["яйця", "рис"]);
  });

  it("sums compatible qty+unit while keeping the existing human-friendly unit", () => {
    const out = mergeItems(
      [{ name: "молоко", qty: 1, unit: "л" }],
      [{ name: "молоко", qty: 500, unit: "мл" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "молоко", unit: "л", qty: 1.5 });
  });

  it("sums when existing entry uses a sub-unit and stays in that sub-unit", () => {
    const out = mergeItems(
      [{ name: "борошно", qty: 200, unit: "г" }],
      [{ name: "борошно", qty: 1, unit: "кг" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "борошно", unit: "г", qty: 1200 });
  });

  it("avoids exact duplicates by fingerprint", () => {
    const out = mergeItems(
      [],
      [
        { name: "курка", qty: 200, unit: "г" },
        { name: "курка", qty: 200, unit: "г" },
      ],
    );
    expect(out).toHaveLength(1);
  });

  it("does not duplicate when incoming has same name but no qty/unit and existing has qty/unit", () => {
    const out = mergeItems(
      [{ name: "огірок", qty: 4, unit: "шт", notes: null }],
      [{ name: "огірок", qty: null, unit: null, notes: null }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ qty: 5, unit: "шт" });
  });

  it("upgrades existing entry without qty/unit when incoming has qty/unit", () => {
    const out = mergeItems(
      [{ name: "огірок", qty: null, unit: null, notes: null }],
      [{ name: "огірок", qty: 4, unit: "шт", notes: null }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ qty: 4, unit: "шт" });
  });

  it("merges AI duplicates: same name with and without qty/unit into one entry", () => {
    const out = mergeItems(
      [],
      [
        { name: "огірок", qty: null, unit: null, notes: null },
        { name: "огірок", qty: 4, unit: "шт", notes: null },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ qty: 5, unit: "шт" });
  });

  it("same product with incompatible units (г vs уп): second entry is skipped by dedup policy", () => {
    const out = mergeItems(
      [{ name: "огірок", qty: 200, unit: "г", notes: null }],
      [{ name: "огірок", qty: 1, unit: "уп", notes: null }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ qty: 200, unit: "г" });
  });

  // B7 — display vs match. Назва показується як введено, зіставляється у
  // нижньому регістрі.
  describe("display-назва vs match-ключ", () => {
    it("нова позиція зберігає введений регістр", () => {
      const out = mergeItems([], [{ name: "Яготинське молоко", qty: 1 }]);
      expect(out[0]?.name).toBe("Яготинське молоко");
    });

    it("зіставляє з наявною позицією попри різний регістр", () => {
      const out = mergeItems(
        [{ name: "Яготинське молоко", qty: 1, unit: "л", notes: null }],
        [{ name: "яготинське молоко", qty: 500, unit: "мл", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        name: "Яготинське молоко",
        qty: 1.5,
        unit: "л",
      });
    });

    it("при злитті виграє назва, що вже лежить у коморі", () => {
      const out = mergeItems(
        [{ name: "Яготинське Молоко", qty: 1, unit: "л", notes: null }],
        [{ name: "ЯГОТИНСЬКЕ МОЛОКО", qty: 1, unit: "л", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe("Яготинське Молоко");
    });

    it("гоїть старий повністю-нижній запис, коли надходить та сама назва з великої", () => {
      const out = mergeItems(
        [{ name: "яготинське молоко", qty: 1, unit: "л", notes: null }],
        [{ name: "Яготинське молоко", qty: 1, unit: "л", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ name: "Яготинське молоко", qty: 2 });
    });

    it("гоїть регістр і тоді, коли кількість не сумується (несумісні одиниці)", () => {
      const out = mergeItems(
        [{ name: "огірок", qty: 200, unit: "г", notes: null }],
        [{ name: "Огірок", qty: 1, unit: "уп", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ name: "Огірок", qty: 200, unit: "г" });
    });

    it("аліас-форма назву НЕ перезаписує — тільки чистий регістр", () => {
      const out = mergeItems(
        [{ name: "огірки", qty: 4, unit: "шт", notes: null }],
        [{ name: "Огірків", qty: 2, unit: "шт", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ name: "огірки", qty: 6 });
    });

    it("старі записи без регістру працюють як раніше (сумісність)", () => {
      const out = mergeItems(
        [{ name: "молоко", qty: 1, unit: "л", notes: null }],
        [{ name: "молоко", qty: 500, unit: "мл", notes: null }],
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ name: "молоко", qty: 1.5, unit: "л" });
    });
  });
});
