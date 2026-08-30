import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  isBlankRow,
  parseCalendarDateKey,
  parseSignedAmountKopiykas,
  tokenizeCsv,
} from "./csvParser.js";

describe("detectDelimiter", () => {
  it("детектить кому (mono-подібний заголовок)", () => {
    expect(detectDelimiter("Дата,Опис,Сума в валюті картки (UAH),Валюта")).toBe(
      ",",
    );
  });

  it("детектить крапку з комою (Privat24-подібний заголовок)", () => {
    expect(
      detectDelimiter("Дата;Категорія;Опис операції;Сума в валюті рахунку"),
    ).toBe(";");
  });

  it("детектить таб", () => {
    expect(detectDelimiter("date\tamount\tdescription")).toBe("\t");
  });

  it("дефолтить на кому, якщо жоден кандидат не зустрівся", () => {
    expect(detectDelimiter("onlyonecolumn")).toBe(",");
  });

  it("ігнорує розділювач усередині лапок при підрахунку", () => {
    // Одна справжня кома-розділювач, плюс кома всередині лапок, яку MUST
    // ігнорувати — інакше semicolon program зчитав би 2 коми і помилково
    // вибрав кому замість крапки з комою.
    const header = 'Дата;"Опис, деталі";Сума';
    expect(detectDelimiter(header)).toBe(";");
  });
});

describe("tokenizeCsv", () => {
  it("парсить прості рядки, розділені комою", () => {
    const rows = tokenizeCsv("a,b,c\n1,2,3\n", ",");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("парсить CRLF-роздільені рядки", () => {
    const rows = tokenizeCsv("a,b\r\n1,2\r\n", ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("не додає зайвий порожній рядок за trailing newline", () => {
    const rows = tokenizeCsv("a,b\n1,2\n", ",");
    expect(rows).toHaveLength(2);
  });

  it("обробляє закавичене поле з embedded-комою", () => {
    const rows = tokenizeCsv('a,"b, c",d\n', ",");
    expect(rows).toEqual([["a", "b, c", "d"]]);
  });

  it("обробляє подвоєні лапки всередині закавиченого поля", () => {
    const rows = tokenizeCsv('a,"ТОВ ""Сільпо-Фуд""",c\n', ",");
    expect(rows).toEqual([["a", 'ТОВ "Сільпо-Фуд"', "c"]]);
  });

  it("обробляє embedded-перенос рядка всередині закавиченого поля", () => {
    const rows = tokenizeCsv('a,"multi\nline",c\n', ",");
    expect(rows).toEqual([["a", "multi\nline", "c"]]);
  });

  it("стрипає BOM на початку файлу", () => {
    const withBom = String.fromCharCode(0xfeff) + "a,b\n1,2\n";
    const rows = tokenizeCsv(withBom, ",");
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("розбирає рядок без trailing newline (останній рядок файлу)", () => {
    const rows = tokenizeCsv("a,b\n1,2", ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("зламаний рядок (менше полів, ніж заголовок) не кидає — просто коротший масив", () => {
    const rows = tokenizeCsv("a,b,c\n1,2\n", ",");
    expect(rows[1]).toEqual(["1", "2"]);
  });
});

describe("isBlankRow", () => {
  it("true для порожнього масиву", () => {
    expect(isBlankRow([])).toBe(true);
  });

  it("true, коли всі поля — порожні/whitespace", () => {
    expect(isBlankRow(["", "  ", ""])).toBe(true);
  });

  it("false, якщо хоч одне поле непорожнє", () => {
    expect(isBlankRow(["", "x", ""])).toBe(false);
  });
});

describe("parseSignedAmountKopiykas", () => {
  it("парсить dot-decimal відʼємну суму (mono-стиль)", () => {
    expect(parseSignedAmountKopiykas("-847.50")).toBe(-84750);
  });

  it("парсить dot-decimal додатну суму", () => {
    expect(parseSignedAmountKopiykas("1000.00")).toBe(100000);
  });

  it("парсить comma-decimal суму з decimalComma:true (Privat24-стиль)", () => {
    expect(parseSignedAmountKopiykas("1234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("парсить суму з пробілом-роздільником тисяч", () => {
    expect(parseSignedAmountKopiykas("1 234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("парсить суму з NBSP-роздільником тисяч", () => {
    expect(parseSignedAmountKopiykas("1 234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("автодетект: лише кома присутня → трактує як десятковий роздільник", () => {
    expect(parseSignedAmountKopiykas("100,50")).toBe(10050);
  });

  it("автодетект: і кома, і крапка — останній символ вважається десятковим (US-стиль 1,234.56)", () => {
    expect(parseSignedAmountKopiykas("1,234.56")).toBe(123456);
  });

  it("автодетект: і кома, і крапка — останній символ десятковий (EU-стиль 1.234,56)", () => {
    expect(parseSignedAmountKopiykas("1.234,56")).toBe(123456);
  });

  it("прибирає суфікс валюти", () => {
    expect(parseSignedAmountKopiykas("100.00 UAH")).toBe(10000);
    expect(parseSignedAmountKopiykas("100.00 грн")).toBe(10000);
  });

  it("decimalComma:false форсує крапку навіть коли є кома (thousands-only)", () => {
    expect(parseSignedAmountKopiykas("1,234.56", { decimalComma: false })).toBe(
      123456,
    );
  });

  it("повертає null на порожній рядок", () => {
    expect(parseSignedAmountKopiykas("")).toBeNull();
    expect(parseSignedAmountKopiykas("   ")).toBeNull();
  });

  it("повертає null на нечисловий рядок (зламаний рядок)", () => {
    expect(parseSignedAmountKopiykas("не число")).toBeNull();
  });

  it("округлює копійки від float-дрейфу", () => {
    expect(parseSignedAmountKopiykas("10.1")).toBe(1010);
  });
});

describe("parseCalendarDateKey", () => {
  it("парсить ISO YYYY-MM-DD автодетектом", () => {
    expect(parseCalendarDateKey("2026-01-15")).toBe("2026-01-15");
  });

  it("парсить DD.MM.YYYY автодетектом", () => {
    expect(parseCalendarDateKey("15.01.2026")).toBe("2026-01-15");
  });

  it("парсить DD.MM.YYYY HH:MM:SS (mono-стиль) — ігнорує час", () => {
    expect(parseCalendarDateKey("31.12.2025 23:59:59")).toBe("2025-12-31");
  });

  it("hint='DD.MM.YYYY' форсує парсинг однозначно-амбівалентної дати", () => {
    // "01.02.2026" сам по собі амбівалентний (1 лютого чи 2 січня?) — з
    // явним hint'ом інтерпретація детермінована.
    expect(parseCalendarDateKey("01.02.2026", "DD.MM.YYYY")).toBe("2026-02-01");
  });

  it("hint='YYYY-MM-DD' форсує ISO-парсинг", () => {
    expect(parseCalendarDateKey("2026-02-01", "YYYY-MM-DD")).toBe("2026-02-01");
  });

  it("hint, що не збігається з фактичним форматом рядка — null", () => {
    expect(parseCalendarDateKey("15.01.2026", "YYYY-MM-DD")).toBeNull();
  });

  it("повертає null на зламаний/нечитабельний рядок", () => {
    expect(parseCalendarDateKey("не дата")).toBeNull();
    expect(parseCalendarDateKey("")).toBeNull();
  });

  it("повертає null на неплатний місяць/день", () => {
    expect(parseCalendarDateKey("2026-13-01")).toBeNull();
    expect(parseCalendarDateKey("2026-01-32")).toBeNull();
  });

  it("повертає null поза жорстким вікном (< 1970 чи > 2100)", () => {
    expect(parseCalendarDateKey("1969-12-31")).toBeNull();
    expect(parseCalendarDateKey("2101-01-01")).toBeNull();
  });
});
