import { describe, expect, it } from "vitest";
import {
  detectCsvProfile,
  isUahCurrencyValue,
  resolveCustomMapping,
} from "./csvProfiles.js";

// AI-DANGER: заголовки нижче — обґрунтована реконструкція формату
// mono/Privat24 CSV-виписок (немає реальних фікстур, див. коментар у
// csvProfiles.ts). Фікстури тут перевіряють ВЛАСНІ припущення модуля
// самоузгоджено — вони НЕ підтверджують точність проти живого банку.

const MONO_HEADERS = [
  "Дата i час операції",
  "Деталі операції",
  "МСС",
  "Сума в валюті картки (UAH)",
  "Сума в валюті операції",
  "Валюта операції",
  "Курс обміну",
  "Сума комісій (UAH)",
  "Сума кешбеку (UAH)",
  "Залишок після операції",
];

const PRIVAT24_HEADERS = [
  "Дата",
  "Категорія",
  "Картка",
  "Опис операції",
  "Сума в валюті рахунку",
  "Валюта рахунку",
  "Сума в валюті операції",
  "Валюта операції",
  "Залишок на рахунку",
];

describe("detectCsvProfile — mono", () => {
  it("детектить mono за заголовком", () => {
    const detected = detectCsvProfile(MONO_HEADERS);
    expect(detected?.profile).toBe("mono");
  });

  it("резолвить правильні індекси колонок", () => {
    const detected = detectCsvProfile(MONO_HEADERS);
    expect(detected?.mapping.dateColIndex).toBe(0);
    expect(detected?.mapping.amountColIndex).toBe(3);
    expect(detected?.mapping.descriptionColIndex).toBe(1);
  });

  it("dateFormat='DD.MM.YYYY', decimalComma=false", () => {
    const detected = detectCsvProfile(MONO_HEADERS);
    expect(detected?.mapping.dateFormat).toBe("DD.MM.YYYY");
    expect(detected?.mapping.decimalComma).toBe(false);
  });

  it("currencyColIndex: null — mono amount-колонка вже гарантовано UAH", () => {
    const detected = detectCsvProfile(MONO_HEADERS);
    expect(detected?.mapping.currencyColIndex).toBeNull();
  });

  it("толерує регістр/пробіли в заголовку (не крихкий exact-match)", () => {
    const messyHeaders = MONO_HEADERS.map((h) => `  ${h.toUpperCase()}  `);
    const detected = detectCsvProfile(messyHeaders);
    expect(detected?.profile).toBe("mono");
  });
});

describe("detectCsvProfile — privat24", () => {
  it("детектить privat24 за заголовком", () => {
    const detected = detectCsvProfile(PRIVAT24_HEADERS);
    expect(detected?.profile).toBe("privat24");
  });

  it("резолвить правильні індекси колонок + currency", () => {
    const detected = detectCsvProfile(PRIVAT24_HEADERS);
    expect(detected?.mapping.dateColIndex).toBe(0);
    expect(detected?.mapping.amountColIndex).toBe(4);
    expect(detected?.mapping.descriptionColIndex).toBe(3);
    expect(detected?.mapping.currencyColIndex).toBe(5);
  });

  it("decimalComma=true (укр. excel-конвенція)", () => {
    const detected = detectCsvProfile(PRIVAT24_HEADERS);
    expect(detected?.mapping.decimalComma).toBe(true);
  });
});

describe("detectCsvProfile — невідомий формат", () => {
  it("повертає null для довільного CSV без відомих фрагментів", () => {
    const detected = detectCsvProfile(["Column A", "Column B", "Column C"]);
    expect(detected).toBeNull();
  });

  it("повертає null, коли бракує лише description-колонки", () => {
    const detected = detectCsvProfile([
      "Дата",
      "Сума в валюті картки (UAH)",
      "Щось інше",
    ]);
    expect(detected).toBeNull();
  });
});

describe("resolveCustomMapping", () => {
  it("резолвить mapping на точні заголовки; dateFormat/decimalComma:undefined без хінта (автодетект per-рядок)", () => {
    const resolved = resolveCustomMapping(["Date", "Amount", "Note"], {
      dateCol: "Date",
      amountCol: "Amount",
      descriptionCol: "Note",
    });
    expect(resolved).toEqual({
      dateColIndex: 0,
      amountColIndex: 1,
      descriptionColIndex: 2,
      currencyColIndex: null,
      dateFormat: undefined,
      // `undefined`, а НЕ `false`: без явного вибору користувача форсована
      // крапка читала б українську кому як роздільник тисяч ("12,50" →
      // 1250 грн). Автодетект розбирає обидві конвенції правильно — та
      // сама логіка, що вже діяла для `dateFormat`.
      decimalComma: undefined,
    });
  });

  it("толерує регістр/пробіли у mapping-полях", () => {
    const resolved = resolveCustomMapping(["Date", "Amount", "Note"], {
      dateCol: "  date  ",
      amountCol: "AMOUNT",
      descriptionCol: "note",
    });
    expect(resolved?.dateColIndex).toBe(0);
    expect(resolved?.amountColIndex).toBe(1);
    expect(resolved?.descriptionColIndex).toBe(2);
  });

  it("повертає null, якщо колонка mapping не знайдена серед headers", () => {
    const resolved = resolveCustomMapping(["Date", "Amount"], {
      dateCol: "Date",
      amountCol: "Amount",
      descriptionCol: "Description (немає серед headers)",
    });
    expect(resolved).toBeNull();
  });

  it("передає dateFormat/decimalComma із mapping", () => {
    const resolved = resolveCustomMapping(["Date", "Amount", "Note"], {
      dateCol: "Date",
      amountCol: "Amount",
      descriptionCol: "Note",
      dateFormat: "YYYY-MM-DD",
      decimalComma: true,
    });
    expect(resolved?.dateFormat).toBe("YYYY-MM-DD");
    expect(resolved?.decimalComma).toBe(true);
  });

  it("currencyColIndex завжди null — custom mapping не несе currency-контракту", () => {
    const resolved = resolveCustomMapping(["Date", "Amount", "Note"], {
      dateCol: "Date",
      amountCol: "Amount",
      descriptionCol: "Note",
    });
    expect(resolved?.currencyColIndex).toBeNull();
  });
});

describe("isUahCurrencyValue", () => {
  it.each(["UAH", "uah", "грн", "грн.", "980", ""])("true для %s", (v) => {
    expect(isUahCurrencyValue(v)).toBe(true);
  });

  it.each(["USD", "EUR", "usd", "978"])("false для %s", (v) => {
    expect(isUahCurrencyValue(v)).toBe(false);
  });
});
