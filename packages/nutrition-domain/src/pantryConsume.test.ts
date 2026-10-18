import { describe, it, expect } from "vitest";
import type { PantryItem } from "./pantryTextParser.js";
import {
  applyConsumeToPantryItem,
  gramsToUnitQty,
  densityFor,
  pieceWeightFor,
  DEFAULT_DENSITY_G_PER_ML,
  DEFAULT_PIECE_WEIGHT_G,
} from "./pantryConsume.js";

describe("gramsToUnitQty", () => {
  it("г: 1:1", () => {
    expect(gramsToUnitQty(200, "г", "рис")).toBe(200);
  });

  it("кг: ділить на 1000", () => {
    expect(gramsToUnitQty(250, "кг", "рис")).toBeCloseTo(0.25, 6);
  });

  it("мл: default-густина (невідомий продукт) → 1.0 г/мл", () => {
    expect(gramsToUnitQty(200, "мл", "вода")).toBeCloseTo(200, 6);
  });

  it("мл: молоко 1.03 г/мл → ~194 мл за 200 г", () => {
    expect(gramsToUnitQty(200, "мл", "молоко")).toBeCloseTo(200 / 1.03, 4);
  });

  it("л: молоко → грами/густину/1000", () => {
    expect(gramsToUnitQty(206, "л", "молоко")).toBeCloseTo(
      206 / 1.03 / 1000,
      6,
    );
  });

  it("шт: default-вага (невідомий продукт) → 100 г/шт", () => {
    expect(gramsToUnitQty(250, "шт", "щось")).toBeCloseTo(2.5, 6);
  });

  it("шт: яйце 60 г/шт → 1 шт за 60 г", () => {
    expect(gramsToUnitQty(60, "шт", "яйце")).toBeCloseTo(1, 6);
  });

  it("відсутня одиниця → трактується як грами (1:1)", () => {
    expect(gramsToUnitQty(150, null, "борошно")).toBe(150);
    expect(gramsToUnitQty(150, undefined, "борошно")).toBe(150);
  });

  it("уп / невідома одиниця → null (без грубого масового відображення)", () => {
    expect(gramsToUnitQty(200, "уп", "печиво")).toBeNull();
    expect(gramsToUnitQty(200, "пучок", "кріп")).toBeNull();
  });

  it("не-додатні / не-скінченні грами → null", () => {
    expect(gramsToUnitQty(0, "г", "рис")).toBeNull();
    expect(gramsToUnitQty(-50, "г", "рис")).toBeNull();
    expect(gramsToUnitQty(Number.NaN, "г", "рис")).toBeNull();
    expect(gramsToUnitQty(Number.POSITIVE_INFINITY, "г", "рис")).toBeNull();
  });

  it("нормалізує одиницю (велика літера / повна форма)", () => {
    expect(gramsToUnitQty(100, "Г", "рис")).toBe(100);
    expect(gramsToUnitQty(1000, "грам", "рис")).toBe(1000);
    expect(gramsToUnitQty(2, "кілограм", "рис")).toBeCloseTo(0.002, 6);
  });

  it("канонізує назву: відмінкова форма «молока» бере густину молока", () => {
    expect(gramsToUnitQty(200, "мл", "молока")).toBeCloseTo(200 / 1.03, 4);
  });
});

describe("densityFor / pieceWeightFor", () => {
  it("повертає табличне значення для відомого продукту", () => {
    expect(densityFor("олія")).toBe(0.92);
    expect(pieceWeightFor("яблуко")).toBe(180);
  });

  it("повертає default для невідомого продукту", () => {
    expect(densityFor("невідома рідина")).toBe(DEFAULT_DENSITY_G_PER_ML);
    expect(pieceWeightFor("невідомий продукт")).toBe(DEFAULT_PIECE_WEIGHT_G);
  });
});

describe("applyConsumeToPantryItem: позиція без варіантів (data-41)", () => {
  const apply = (item: PantryItem, grams: number) => {
    const res = applyConsumeToPantryItem(item, grams);
    if (!res) throw new Error("очікували списання");
    return res;
  };

  it("Сир 0.5 кг: 5 порцій по 40 г зменшують залишок, а сума deducted = різниця", () => {
    let item: PantryItem | null = {
      name: "Сир",
      qty: 0.5,
      unit: "кг",
      notes: null,
    };
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      const before: number = item!.qty as number;
      const res = apply(item!, 40);
      item = res.item;
      expect(item).not.toBeNull();
      // Подія журналу дорівнює реальній зміні залишку (ADR-0077).
      expect(res.deducted).toBeCloseTo(before - (item!.qty as number), 9);
      expect(res.deducted).toBeGreaterThan(0);
      sum += res.deducted;
    }
    expect(item!.qty).toBeCloseTo(0.3, 9);
    expect(sum).toBeCloseTo(0.2, 9);
  });

  it("Молоко 1 л, 30 г: залишок зменшується, deducted = qty до - qty після", () => {
    const res = apply({ name: "Молоко", qty: 1, unit: "л", notes: null }, 30);
    expect(res.item!.qty).toBeLessThan(1);
    expect(res.item!.qty).toBeCloseTo(0.971, 3);
    expect(res.deducted).toBeCloseTo(1 - (res.item!.qty as number), 9);
  });

  it("500 г - 200 г = 300 (без змін)", () => {
    const res = apply({ name: "Рис", qty: 500, unit: "г", notes: null }, 200);
    expect(res.item!.qty).toBe(300);
    expect(res.deducted).toBe(200);
  });

  it("вичерпання: item null, deducted = сира перевитрата", () => {
    const res = apply({ name: "Рис", qty: 100, unit: "г", notes: null }, 250);
    expect(res.item).toBeNull();
    expect(res.deducted).toBe(250);
  });

  it("залишок, що округлюється в нуль, прибирає позицію з deducted = qty", () => {
    const res = apply(
      { name: "Сіль", qty: 0.001, unit: "кг", notes: null },
      0.8,
    );
    expect(res.item).toBeNull();
    expect(res.deducted).toBe(0.001);
  });
});
