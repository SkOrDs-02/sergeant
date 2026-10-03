import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  isBlankRow,
  parseCalendarDateKey,
  tokenizeCsv,
} from "./csvParser.js";

describe("detectDelimiter", () => {
  it("детектить кому", () => {
    expect(detectDelimiter("Date,Description,Amount")).toBe(",");
  });

  it("детектить крапку з комою", () => {
    expect(detectDelimiter("Date;Description;Amount")).toBe(";");
  });

  it("детектить таб", () => {
    expect(detectDelimiter("date\tamount\tdescription")).toBe("\t");
  });

  it("дефолтить на кому, якщо жоден кандидат не зустрівся", () => {
    expect(detectDelimiter("onlyonecolumn")).toBe(",");
  });

  it("ігнорує розділювач усередині лапок при підрахунку", () => {
    const header = 'Date;"Description, details";Amount';
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

  it("парсить CRLF-розділені рядки", () => {
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

  it("розбирає рядок без trailing newline", () => {
    const rows = tokenizeCsv("a,b\n1,2", ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("зламаний рядок не кидає", () => {
    const rows = tokenizeCsv("a,b,c\n1,2\n", ",");
    expect(rows[1]).toEqual(["1", "2"]);
  });
});

describe("isBlankRow", () => {
  it("true для порожнього масиву", () => {
    expect(isBlankRow([])).toBe(true);
  });

  it("true, коли всі поля порожні або whitespace", () => {
    expect(isBlankRow(["", "  ", ""])).toBe(true);
  });

  it("false, якщо хоч одне поле непорожнє", () => {
    expect(isBlankRow(["", "x", ""])).toBe(false);
  });
});

describe("parseCalendarDateKey", () => {
  it("парсить ISO YYYY-MM-DD автодетектом", () => {
    expect(parseCalendarDateKey("2026-01-15")).toBe("2026-01-15");
  });

  it("парсить DD.MM.YYYY автодетектом", () => {
    expect(parseCalendarDateKey("15.01.2026")).toBe("2026-01-15");
  });

  it("парсить DD.MM.YYYY HH:MM:SS і ігнорує час", () => {
    expect(parseCalendarDateKey("31.12.2025 23:59:59")).toBe("2025-12-31");
  });

  it("hint='DD.MM.YYYY' форсує парсинг", () => {
    expect(parseCalendarDateKey("01.02.2026", "DD.MM.YYYY")).toBe("2026-02-01");
  });

  it("hint='YYYY-MM-DD' форсує ISO-парсинг", () => {
    expect(parseCalendarDateKey("2026-02-01", "YYYY-MM-DD")).toBe("2026-02-01");
  });

  it("hint, що не збігається з форматом рядка, дає null", () => {
    expect(parseCalendarDateKey("15.01.2026", "YYYY-MM-DD")).toBeNull();
  });

  it("повертає null на зламаний рядок", () => {
    expect(parseCalendarDateKey("не дата")).toBeNull();
    expect(parseCalendarDateKey("")).toBeNull();
  });

  it("повертає null на неіснуючий місяць або день", () => {
    expect(parseCalendarDateKey("2026-13-01")).toBeNull();
    expect(parseCalendarDateKey("2026-01-32")).toBeNull();
    expect(parseCalendarDateKey("2026-02-30")).toBeNull();
  });

  it("повертає null поза жорстким вікном", () => {
    expect(parseCalendarDateKey("1969-12-31")).toBeNull();
    expect(parseCalendarDateKey("2101-01-01")).toBeNull();
  });
});
