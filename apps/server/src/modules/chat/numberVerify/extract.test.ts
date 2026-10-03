/**
 * Витяг і нормалізація чисел: формати, одиниці, похибка, скоуп, вирізання
 * ідентифікаторів (ADR-0097). Фактичні відповіді моделей - у
 * `realCorpus.test.ts`; тут окремі формати, по одному на тест.
 */

import { describe, expect, it } from "vitest";
import { extractNumberTokens } from "./extract.js";
import { maskNonQuantities, parseNumeral, toleranceFor } from "./normalize.js";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

/** Значення першого токена: усі формати нижче мають давати рівно один. */
function only(text: string) {
  const tokens = extractNumberTokens(text);
  expect(tokens).toHaveLength(1);
  return tokens[0]!;
}

describe("parseNumeral", () => {
  it.each([
    ["960", 960],
    ["12 345", 12345],
    [`12${NBSP}345`, 12345],
    [`12${NNBSP}345`, 12345],
    ["1 234 567", 1234567],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["12 345,67", 12345.67],
    ["1.240.000", 1240000],
    ["1,240,000", 1240000],
    ["1.240,50", 1240.5],
    ["1,240.50", 1240.5],
  ])("%s -> %d", (raw, expected) => {
    expect(parseNumeral(raw)?.value).toBeCloseTo(expected, 6);
  });

  it("запис з однією групою двозначний і віддає обидва прочитання", () => {
    expect(parseNumeral("1.240")).toMatchObject({ value: 1240, alt: 1.24 });
    expect(parseNumeral("1,240")).toMatchObject({ value: 1240, alt: 1.24 });
  });

  it("нуль на початку не група розряду: 0,125 це десяткове", () => {
    expect(parseNumeral("0,125")).toMatchObject({ value: 0.125, alt: null });
  });
});

describe("toleranceFor", () => {
  it("мінімум пів одиниці", () => {
    expect(toleranceFor(0, 1)).toBe(0.5);
    expect(toleranceFor(2, 1)).toBe(0.5);
  });

  it("множник «тис.» розширює похибку до півкроку розряду", () => {
    expect(toleranceFor(0, 1000)).toBe(500);
    expect(toleranceFor(1, 1000)).toBe(50);
  });
});

describe("extractNumberTokens: формати", () => {
  it.each([
    ["Витрати 1240 грн", 1240],
    ["Витрати 1 240 грн", 1240],
    [`Витрати 1${NBSP}240 грн`, 1240],
    [`Витрати 1${NNBSP}240${NNBSP}грн`, 1240],
    ["Витрати **960 грн**", 960],
    ["Витрати **960** грн", 960],
    ["Витрати 960грн", 960],
    ["Витрати 960 ГРН.", 960],
    ["Витрати 960 гривень", 960],
    ["Витрати ₴1 490", 1490],
    ["Витрати 1 490 ₴", 1490],
    ["Витрати 1 234,5 грн", 1234.5],
    ["Витрати 1234.5 грн", 1234.5],
    ["Витрати 34 тис. грн", 34000],
    ["Витрати 34 тис грн", 34000],
    ["Витрати 1,2 тис. грн", 1200],
    ["Витрати 1.2 тис. грн", 1200],
    ["Витрати 2 млн грн", 2000000],
    ["Їси 2500 ккал", 2500],
    ["Їси 2500 калорій", 2500],
    ["Вага 120 кг", 120],
    ["Вага 500 г", 500],
    ["Вага 500г", 500],
    ["Вага 500 грамів", 500],
    ["Вага 1 500 г", 1500],
  ])("%s", (text, value) => {
    const token = only(text);
    expect(token.value).toBeCloseTo(value, 6);
    expect(token.scoped).toBe(true);
  });

  it("похибка береться з розряду й множника", () => {
    expect(only("960 грн").tol).toBe(0.5);
    expect(only("34 тис. грн").tol).toBe(500);
    expect(only("1,2 тис. грн").tol).toBe(50);
  });

  it("двозначне 1.240: за грн це тисяча, за кг це десяткове", () => {
    expect(only("1.240 грн").value).toBe(1240);
    expect(only("1.240 ккал").value).toBe(1240);
    expect(only("1,250 кг").value).toBeCloseTo(1.25, 6);
    // Без одиниці лишаються обидва прочитання.
    const bare = only("значення 1.240");
    expect([bare.value, bare.alt]).toEqual([1240, 1.24]);
  });

  it("знак мінус відкидається", () => {
    expect(only("баланс -6 200 грн").value).toBe(6200);
  });
});

describe("extractNumberTokens: скоуп", () => {
  it.each([
    ["Витрати 95 грн", false],
    ["Витрати 99,9 грн", false],
    ["Витрати 100 грн", true],
    ["Вага 5 кг", false],
    ["Вага 100 кг", true],
    ["Їси 99 ккал", false],
    ["Їси 100 ккал", true],
    ["Вага 99 г", false],
    ["Вага 100 г", true],
  ])("%s -> скоуп %s", (text, scoped) => {
    expect(only(text).scoped).toBe(scoped);
  });

  it("відсотки, лічильники й числа без одиниці лишаються поза скоупом", () => {
    const tokens = extractNumberTokens(
      "Це 56% з 8 транзакцій, а ще 1200 разів і 7.5 години.",
    );
    expect(tokens.every((t) => !t.scoped)).toBe(true);
    expect(tokens.find((t) => t.value === 56)?.percent).toBe(true);
    expect(tokens).toHaveLength(4);
  });

  it("число без одиниці, хоч і велике, не перевіряється", () => {
    expect(only("Усього 5200").scoped).toBe(false);
  });

  it("множник без одиниці читається, але не перевіряється", () => {
    const token = only("близько 34 тис.");
    expect(token.value).toBe(34000);
    expect(token.scoped).toBe(false);
  });

  it("година, що починається з «г», не стає грамами", () => {
    expect(only("спав 500 годин").unit).toBeNull();
  });
});

describe("maskNonQuantities: що числом не є", () => {
  const values = (text: string) =>
    extractNumberTokens(text).map((t) => t.value);

  it("ідентифікатори з літерами й цифрами", () => {
    expect(values("tx_9f21 і call_516934 та hab_run2")).toEqual([]);
    expect(values("TOKEN-CANARY-7781")).toEqual([]);
    expect(values("код A4 і 9f21a3bc")).toEqual([]);
  });

  it("uuid", () => {
    expect(values("id 123e4567-e89b-12d3-a456-426614174000")).toEqual([]);
  });

  it("ISO-дати, час, дати з роком, роки перед «року»", () => {
    expect(values("2026-07-29")).toEqual([]);
    expect(values("2026-07-29T10:00:00Z")).toEqual([]);
    expect(values("о 21:00 і 21:00:15")).toEqual([]);
    expect(values("29.07.2026 і 29/07/26")).toEqual([]);
    expect(values("у 2026 році та 2026 р.")).toEqual([]);
    expect(values("29-го числа")).toEqual([]);
  });

  it("довгі цифрові рядки: картки, телефони", () => {
    expect(values("+380501234567 і 4441111122223333")).toEqual([]);
  });

  it("URL", () => {
    expect(values("https://example.com/p/12345?x=900")).toEqual([]);
  });

  it("маркер усічення з toolResultTruncation не дає чисел", () => {
    const marker =
      "[…truncated 1500 chars; original 2500 chars sent to Sentry breadcrumb…]";
    expect(values(marker)).toEqual([]);
  });

  it("слово з одиницею лишається числом, слово з іншими літерами - ні", () => {
    expect(maskNonQuantities("960грн")).toBe("960грн");
    expect(maskNonQuantities("500г")).toBe("500г");
    expect(maskNonQuantities("20хв")).not.toContain("20");
    expect(maskNonQuantities("12000 грн")).toBe("12000 грн");
  });

  it("довжина тексту не змінюється: зсуви збігаються з оригіналом", () => {
    const text = "tx_9f21 — 2026-07-29, 120 грн";
    expect(maskNonQuantities(text)).toHaveLength(text.length);
    const token = only(text);
    expect(text.slice(token.start, token.end)).toBe("120 грн");
  });
});
