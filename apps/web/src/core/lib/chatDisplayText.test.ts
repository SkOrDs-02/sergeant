import { describe, expect, it } from "vitest";
import { stripTechnicalIds } from "./chatDisplayText";

describe("stripTechnicalIds", () => {
  it("прибирає окремі дужки (id:…) і (tx:…)", () => {
    expect(stripTechnicalIds("Витрату 120 грн записано (id:m_1a2b)")).toBe(
      "Витрату 120 грн записано",
    );
    expect(stripTechnicalIds('Погашено 200 грн з "Кредит" (tx:m_9)')).toBe(
      'Погашено 200 грн з "Кредит"',
    );
    expect(stripTechnicalIds("Тренування завершено (id:w1), підходів: 5")).toBe(
      "Тренування завершено, підходів: 5",
    );
  });

  it("прибирає id останнім у дужках, лишаючи людський вміст", () => {
    expect(
      stripTechnicalIds("Запамʼятав: Звати Діма (Інше, id:5c47fa7f-1234)"),
    ).toBe("Запамʼятав: Звати Діма (Інше)");
  });

  it("не чіпає текст без технічних id", () => {
    const text = "Додано 250 мл води (разом за 2026-11-18: 1 000 мл)";
    expect(stripTechnicalIds(text)).toBe(text);
  });
});
