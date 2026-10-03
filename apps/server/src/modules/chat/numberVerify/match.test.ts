/**
 * Звірка: дослівний збіг, виведення з операндів відповіді, ланцюжок, межі,
 * ідентифікатори й маркер усічення в «поданому» (ADR-0097).
 */

import { describe, expect, it } from "vitest";
import {
  buildGivenCorpus,
  corpusFromValues,
  verifyAnswerNumbers,
  isDerivable,
  verifyNumbers,
} from "./index.js";
import { truncateToolResults } from "../toolResultTruncation.js";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

/** Подане з одного результату інструмента. */
const given = (...toolResults: string[]) => ({ toolResults });

const outcome = (answer: string, ...toolResults: string[]) =>
  verifyAnswerNumbers(answer, given(...toolResults)).outcome;

describe("дослівний збіг із поданим", () => {
  it("те саме число в іншому форматі групування", () => {
    expect(outcome("Витрати 32000 грн", "дохід 32 000 грн")).toBe("ok");
    expect(outcome("Витрати 32 000 грн", "дохід 32000 грн")).toBe("ok");
    expect(outcome(`Витрати 32${NBSP}000 грн`, "дохід 32000 грн")).toBe("ok");
    expect(outcome(`Витрати 32${NNBSP}000 грн`, `дохід 32${NBSP}000 грн`)).toBe(
      "ok",
    );
    expect(outcome("Витрати 32000 грн", "amount: 32000")).toBe("ok");
  });

  it("жирне виділення й одиниця без пробілу", () => {
    expect(outcome("Разом **960 грн**.", "разом 960 грн")).toBe("ok");
    expect(outcome("Разом 960грн", "разом 960 грн")).toBe("ok");
  });

  it("десяткова кома проти десяткової крапки", () => {
    expect(outcome("Витрати 1 234,5 грн", "сума 1234.5 грн")).toBe("ok");
    expect(outcome("Витрати 1234.5 грн", "сума 1 234,5 грн")).toBe("ok");
  });

  it("«тис.» читається як тисячі, з похибкою півкроку розряду", () => {
    expect(outcome("Підписки 34 тис. грн", "підписки 34000 грн")).toBe("ok");
    expect(outcome("Підписки 34 тис. грн", "підписки 34400 грн")).toBe("ok");
    expect(outcome("Підписки 1,2 тис. грн", "підписки 1234 грн")).toBe("ok");
    expect(outcome("Підписки 34 тис. грн", "підписки 36000 грн")).toBe(
      "mismatch",
    );
  });

  it("зайва копійка в поданому не ламає округлену відповідь", () => {
    expect(outcome("Витрати 1235 грн", "сума 1234,56 грн")).toBe("ok");
    expect(outcome("Витрати 1236 грн", "сума 1234,56 грн")).toBe("mismatch");
  });

  it("число без одиниці в поданому теж джерело", () => {
    expect(outcome("Витрати 12000 грн", '{"rent": 12000}')).toBe("ok");
  });

  it("двозначне 1.240 у поданому приймає обидва прочитання", () => {
    expect(outcome("Вага 1240 г", "вага 1.240")).toBe("ok");
  });

  it("вага в іншій одиниці: 1 500 г проти 1,5 кг у поданому", () => {
    expect(outcome("Гречки 1 500 г", "гречка 1,5 кг")).toBe("ok");
    expect(outcome("Гречки 1 520 г", "гречка 1,5 кг")).toBe("mismatch");
  });

  it("діапазон через дефіс не ховає числа: перевіряється кожне з одиницею", () => {
    expect(outcome("Платіж 500-700 грн", "платіж 700 грн")).toBe("ok");
    expect(outcome("Платіж 500-800 грн", "платіж 700 грн")).toBe("mismatch");
  });

  it("число, якого немає, - розбіжність", () => {
    const r = verifyAnswerNumbers("Витрати 4500 грн", given("витрати 960 грн"));
    expect(r.outcome).toBe("mismatch");
    expect(r.unexplained.map((u) => u.token.value)).toEqual([4500]);
  });

  it("порожнє подане: будь-яка названа сума вигадана", () => {
    expect(verifyAnswerNumbers("Витрачено 5200 грн", {}).outcome).toBe(
      "mismatch",
    );
  });

  it("без перевірюваних чисел: no_scoped", () => {
    expect(outcome("Це 56% від 8 транзакцій", "нічого")).toBe("no_scoped");
    expect(outcome("Витрати 95 грн", "нічого")).toBe("no_scoped");
  });
});

describe("виведення з операндів відповіді", () => {
  const data = "продукти 8420 грн, їжа 4870 грн, дохід 32000 грн";

  it("сума двох операндів", () => {
    expect(
      outcome("Продукти 8420 грн і їжа 4870 грн, разом 13290 грн", data),
    ).toBe("ok");
  });

  it("різниця двох операндів", () => {
    expect(
      outcome("Дохід 32000 грн, продукти 8420 грн: решта 23580 грн", data),
    ).toBe("ok");
  });

  it("ланцюжок: виведене число саме операнд наступного", () => {
    const text =
      "Витрати 18090 грн (8420 + 4870 + 4800), залишається 13910 грн із 32000 грн";
    const r = verifyAnswerNumbers(
      text,
      given("продукти 8420 грн, їжа 4870 грн, інше 4800 грн, дохід 32000 грн"),
    );
    expect(r.outcome).toBe("ok");
    const byValue = new Map(r.scoped.map((s) => [s.token.value, s.explained]));
    expect(byValue.get(18090)).toBe("derived");
    expect(byValue.get(13910)).toBe("derived");
  });

  it("арифметична помилка в сумі - розбіжність", () => {
    const rent = [12000, 250, 34000, 800];
    const trueTotal = rent.reduce((a, b) => a + b, 0);
    const claimed = trueTotal - 2000;
    const data2 =
      "оренда 12000 грн; інтернет 250 грн; підписки 34000 грн; спортзал 800 грн";
    const wrong = `Оренда 12000 грн, інтернет 250 грн, підписки 34000 грн, спортзал 800 грн. Разом ${claimed} грн`;
    const right = wrong.replace(String(claimed), String(trueTotal));
    expect(outcome(wrong, data2)).toBe("mismatch");
    expect(outcome(right, data2)).toBe("ok");
  });

  it("повторення виведеного числа в тексті теж пояснене", () => {
    const text =
      "Продукти 8420 грн, їжа 4870 грн: разом 13290 грн. Тобто 13290 грн на їжу.";
    expect(outcome(text, data)).toBe("ok");
  });

  it("повторене число не стає двома операндами", () => {
    // 960 двічі в тексті - це одне число, а не 1920.
    const text = "Кава 960 грн. Підсумок: 960 грн. Це 1920 грн.";
    expect(outcome(text, "кава 960 грн")).toBe("mismatch");
  });

  it("різниця береться за модулем: перевитрата без знака", () => {
    const text = "Витрати 34200 грн, дохід 28000 грн, перевитрата 6200 грн";
    expect(outcome(text, "витрати 34200 грн, дохід 28000 грн")).toBe("ok");
  });

  it("з поданого, якого відповідь не показала, число не виводиться", () => {
    // 8420 + 4870 = 13290 у поданому є, але у відповіді показано лише 13290.
    expect(outcome("Разом 13290 грн", data)).toBe("mismatch");
  });

  it("відсоток, середнє, ділення не виводяться", () => {
    const text = "Витрати 960 грн за 8 покупок: у середньому 120 грн";
    expect(outcome(text, "8 покупок, разом 960 грн")).toBe("mismatch");
  });

  it("операнд може стояти в тексті після виведеного числа", () => {
    const text = "Разом 13290 грн: продукти 8420 грн і їжа 4870 грн";
    expect(outcome(text, data)).toBe("ok");
  });
});

describe("isDerivable", () => {
  it("сума до шести операндів, не більше", () => {
    expect(isDerivable(600, 0.5, [100, 100, 100, 100, 100, 100])).toBe(true);
    expect(isDerivable(700, 0.5, [100, 100, 100, 100, 100, 100, 100])).toBe(
      false,
    );
  });

  it("різниця й знакові комбінації", () => {
    expect(isDerivable(300, 0.5, [1000, 700])).toBe(true);
    expect(isDerivable(1100, 0.5, [1000, 700, 600])).toBe(true);
    expect(isDerivable(150, 0.5, [1000, 700, 600, 100])).toBe(false);
  });

  it("один операнд - це не виведення", () => {
    expect(isDerivable(1000, 0.5, [1000])).toBe(false);
  });

  it("похибка цілі", () => {
    expect(isDerivable(1000.4, 0.5, [600, 400])).toBe(true);
    expect(isDerivable(1001, 0.5, [600, 400])).toBe(false);
    expect(isDerivable(1000, 50, [980, 20.5, 5])).toBe(true);
  });
});

describe("ідентифікатори й маркер усічення не стають поданим", () => {
  it("числа з id, uuid, hex і дат не прикривають вигадану суму", () => {
    const tool =
      "tx_4500 — 2026-07-29, 120 грн, «кава»; uuid 123e4567-e89b-12d3-a456-426614174000; ref 9f21a3bc; о 21:30";
    expect(outcome("Витрата 120 грн", tool)).toBe("ok");
    expect(outcome("Витрата 4500 грн", tool)).toBe("mismatch");
    expect(outcome("Витрата 2026 грн", tool)).toBe("mismatch");
    expect(outcome("Витрата 2130 грн", tool)).toBe("mismatch");
  });

  it("числа маркера усічення справжнього truncateToolResults виключено", () => {
    const filler = "рядок ".repeat(500);
    const [truncated] = truncateToolResults(
      [
        {
          tool_use_id: "t1",
          content: `продукти 8420 грн; ${filler} підписки 890 грн`,
        },
      ],
      { addBreadcrumb: () => {}, recordMetric: () => {} },
    );
    const content = truncated!.content;
    expect(content).toMatch(/truncated \d+ chars; original \d+ chars/);
    const original = /original (\d+) chars/.exec(content)![1]!;
    const dropped = /truncated (\d+) chars/.exec(content)![1]!;

    // Числа з голови й хвоста лишились поданими.
    expect(outcome("Продукти 8420 грн, підписки 890 грн", content)).toBe("ok");
    // А розмір блоба, який несе маркер, - ні.
    expect(outcome(`Витрати ${original} грн`, content)).toBe("mismatch");
    expect(outcome(`Витрати ${dropped} грн`, content)).toBe("mismatch");
  });
});

describe("джерела поданого", () => {
  it("контекст, питання користувача й попередні відповіді асистента", () => {
    const sources = {
      contexts: ["Бюджет 28000 грн"],
      userMessages: ["Я витратив 5200 грн на їжу"],
      assistantMessages: ["Минулого разу було 7100 грн"],
    };
    const answer = "Бюджет 28000 грн, їжа 5200 грн, минулого разу 7100 грн";
    expect(verifyAnswerNumbers(answer, sources).outcome).toBe("ok");
    expect(verifyAnswerNumbers("Було 6100 грн", sources).outcome).toBe(
      "mismatch",
    );
  });

  it("порожній текст у джерелах не ламає розбір", () => {
    expect(
      verifyAnswerNumbers("Разом 960 грн", {
        contexts: [""],
        toolResults: [""],
        userMessages: [],
      }).outcome,
    ).toBe("mismatch");
  });
});

describe("корпус і межі", () => {
  it("corpusFromValues шукає в межах похибки, не лише точний збіг", () => {
    const corpus = corpusFromValues([100, 960.4, 5000]);
    expect(corpus.size).toBe(3);
    expect(corpus.has(960, 0.5)).toBe(true);
    expect(corpus.has(961, 0.5)).toBe(false);
    expect(corpus.has(4990, 10)).toBe(true);
    expect(corpus.has(99, 0.5)).toBe(false);
  });

  it("verifyNumbers детермінований: те саме на вході - те саме на виході", () => {
    const corpus = buildGivenCorpus(given("продукти 8420 грн, їжа 4870 грн"));
    const text = "Продукти 8420 грн, їжа 4870 грн, разом 13290 грн, ще 777 грн";
    expect(verifyNumbers(text, corpus)).toEqual(verifyNumbers(text, corpus));
  });

  it("відповідь із десятками чисел не уповільнює звірку до секунд", () => {
    const parts = Array.from({ length: 80 }, (_, i) => `${1000 + i * 7} грн`);
    const started = Date.now();
    const r = verifyAnswerNumbers(parts.join(", "), given("нічого 100 грн"));
    expect(r.outcome).toBe("mismatch");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
