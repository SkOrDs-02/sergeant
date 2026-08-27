import { describe, expect, it } from "vitest";
import {
  buildProductSearchKey,
  normalizeProductText,
} from "./productSearchKey";

describe("normalizeProductText", () => {
  it("згортає регістр кирилиці — те, чого не вміє lower() під ctype C", () => {
    // Саме цей випадок ламав пошук, коли ключ рахувала БД:
    // lower('Яготинське') під ctype C повертає рядок без змін.
    expect(normalizeProductText("Яготинське")).toBe("яготинське");
    expect(normalizeProductText("МОЛОКО 2,6%")).toBe("молоко 2,6%");
  });

  it("згортає регістр латиниці", () => {
    expect(normalizeProductText("Monini CLASSICO")).toBe("monini classico");
  });

  it("стискає пробіли й обрізає краї", () => {
    expect(normalizeProductText("  Молоко   2.6%  \n Яготинське ")).toBe(
      "молоко 2.6% яготинське",
    );
  });

  it("зводить усі варіанти апострофа до одного", () => {
    // Форми будуються з кодпоінтів навмисно, а не пишуться літерами:
    // масова заміна апострофа 2026-08-26 сплющила цей тест в одну форму
    // й він перестав щось перевіряти. Через `\u` таке вже не станеться.
    const APOS = ["\u2019", "\u02BC", "\u0060", "\u0027"];
    expect(new Set(APOS).size).toBe(4);
    // Ціль згортання тут — ASCII `'`, а НЕ канонічний `ʼ`: результат
    // персиститься в `generic_foods.name_norm` (див. коментар у модулі).
    const expected = `м\u0027ясо`;
    for (const a of APOS) {
      expect(normalizeProductText(`м${a}ясо`)).toBe(expected);
    }
  });

  it("порожні й нетекстові входи дають порожній рядок", () => {
    expect(normalizeProductText(null)).toBe("");
    expect(normalizeProductText(undefined)).toBe("");
    expect(normalizeProductText("   ")).toBe("");
  });

  it("ідемпотентна — повторне застосування нічого не змінює", () => {
    const once = normalizeProductText("  Молоко  ЯГОТИНСЬКЕ м’яке ");
    expect(normalizeProductText(once)).toBe(once);
  });
});

describe("buildProductSearchKey", () => {
  it("складає назву з брендом", () => {
    expect(buildProductSearchKey("Молоко 2,6%", "Яготинське")).toBe(
      "молоко 2,6% яготинське",
    );
  });

  it("дозволяє знайти товар за брендом, якого немає в назві", () => {
    const key = buildProductSearchKey("Торт Празький", "Рошен");
    expect(key).toContain("рошен");
  });

  it("працює без бренда", () => {
    expect(buildProductSearchKey("Огірок тепличний")).toBe("огірок тепличний");
    expect(buildProductSearchKey("Огірок тепличний", null)).toBe(
      "огірок тепличний",
    );
    expect(buildProductSearchKey("Огірок тепличний", "  ")).toBe(
      "огірок тепличний",
    );
  });

  it("не лишає подвійного пробілу між назвою і брендом", () => {
    expect(buildProductSearchKey("Молоко ", " Яготинське")).toBe(
      "молоко яготинське",
    );
  });

  it("порожня назва без бренда дає порожній ключ", () => {
    // CHECK product_catalog_name_norm_check відхилить такий рядок на межі
    // БД — порожній ключ означає товар, який ніколи не знайдеться текстом.
    expect(buildProductSearchKey("", "")).toBe("");
  });
});
