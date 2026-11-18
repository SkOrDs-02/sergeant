import { describe, expect, it } from "vitest";
import { hasTechnicalIds, stripTechnicalIds } from "./chatDisplayText";

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

  it("прибирає id з елементів списку операцій (find_transaction, query_transactions)", () => {
    expect(
      stripTechnicalIds(
        "Знайдено 2 операц.: m_1: 2026-11-17 · 120 грн · кава · Кафе; ZuHWzqkKGVo=: без дати · 40 грн",
      ),
    ).toBe(
      "Знайдено 2 операц.: 2026-11-17 · 120 грн · кава · Кафе; без дати · 40 грн",
    );
  });

  it("прибирає id з тексту відмови, лишаючи людський підпис", () => {
    expect(stripTechnicalIds("Звичку не знайдено (id:h1).")).toBe(
      "Звичку не знайдено.",
    );
    expect(
      stripTechnicalIds(
        "Операцію «Кава» на 120 грн не видалено (id:abc): можна видаляти лише ручні записи.",
      ),
    ).toBe(
      "Операцію «Кава» на 120 грн не видалено: можна видаляти лише ручні записи.",
    );
  });

  it("hasTechnicalIds бачить усі три форми й мовчить на звичайному тексті", () => {
    expect(hasTechnicalIds("Записано (id:m_1)")).toBe(true);
    expect(hasTechnicalIds("Факт (Інше, id:5c47)")).toBe(true);
    expect(hasTechnicalIds("Знайдено 1 операц.: m_1: 2026-11-17 · 5 грн")).toBe(
      true,
    );
    expect(hasTechnicalIds("Витрати за тиждень: 1 200 грн")).toBe(false);
  });

  it("не чіпає текст без технічних id", () => {
    const text = "Додано 250 мл води (разом за 2026-11-18: 1 000 мл)";
    expect(stripTechnicalIds(text)).toBe(text);
  });
});
