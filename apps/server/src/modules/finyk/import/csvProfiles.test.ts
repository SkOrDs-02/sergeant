import { describe, expect, it } from "vitest";
import {
  detectCsvProfile,
  isUahCurrencyValue,
  resolveCustomMapping,
} from "./csvProfiles.js";

// Заголовки нижче — з РЕАЛЬНИХ експортів (mono: live-прогін 2026-08-18;
// Privat24: XLSX «Історія операцій за період», 2026-08-25). Самі виписки
// в репо не лежать — тут лише рядок заголовків, без фінансових даних.
// `PRIVAT24_ACCOUNT_HEADERS` — навпаки, ДОСІ припущення: виписки по
// рахунку (а не по картці) живого зразка ще не бачили, тому фрагмент
// «рахунку» лишається запасним варіантом у профілі.

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
  "Сума в валюті картки",
  "Валюта картки",
  "Сума в валюті транзакції",
  "Валюта транзакції",
  "Залишок на кінець періоду",
  "Валюта залишку",
];

const PRIVAT24_ACCOUNT_HEADERS = [
  "Дата",
  "Категорія",
  "Опис операції",
  "Сума в валюті рахунку",
  "Валюта рахунку",
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

  it("decimalComma лишається автодетектом", () => {
    // Живий XLSX друкує КРАПКУ (`-1366.82`) попри український локаль, а
    // доказів про CSV-експорт того ж банку немає — тому не форсуємо
    // жодного роздільника. Раніше тут стояло `true` (припущення про
    // укр. excel-конвенцію), і на реальному файлі воно зробило б
    // із `-1366.82` суму в 100 разів більшу.
    const detected = detectCsvProfile(PRIVAT24_HEADERS);
    expect(detected?.mapping.decimalComma).toBeUndefined();
  });

  it("валютний фільтр дивиться на КАРТКУ, не на транзакцію", () => {
    // Індекс 5 — «Валюта картки». Індекс 7 («Валюта транзакції») на
    // реальному файлі несе USD для покупок Apple гривневою карткою, і
    // фільтр по ньому викидав би їх як `not_uah`.
    const detected = detectCsvProfile(PRIVAT24_HEADERS);
    expect(detected?.mapping.currencyColIndex).toBe(5);
  });

  it("розуміє і виписку по рахунку — запасні фрагменти «рахунку»", () => {
    const detected = detectCsvProfile(PRIVAT24_ACCOUNT_HEADERS);
    expect(detected?.profile).toBe("privat24");
    expect(detected?.mapping.amountColIndex).toBe(3);
    expect(detected?.mapping.currencyColIndex).toBe(4);
  });

  it("mono не перехоплює Privat24, попри спільний підпис суми", () => {
    // Обидва банки підписують суму «Сума в валюті картки» — розрізняє їх
    // колонка опису («Деталі операції» проти «Опис операції»).
    expect(detectCsvProfile(PRIVAT24_HEADERS)?.profile).toBe("privat24");
    expect(detectCsvProfile(MONO_HEADERS)?.profile).toBe("mono");
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
