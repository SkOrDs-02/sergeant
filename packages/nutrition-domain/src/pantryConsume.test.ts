import { describe, it, expect } from "vitest";
import {
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
