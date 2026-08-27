import { describe, expect, it } from "vitest";
import {
  canonicalNumberString,
  columnRefToIndex,
  decodeXmlEntities,
  excelSerialToDateString,
  isXlsxZip,
  XlsxFormatError,
  xlsxToGrid,
} from "./xlsxGrid.js";
import { readZip } from "./zipReader.js";
import { makeZip } from "./__fixtures__/makeXlsx.js";

describe("decodeXmlEntities", () => {
  it("розгортає іменовані, десяткові й шістнадцяткові сутності", () => {
    expect(decodeXmlEntities("АТБ &amp; Co &lt;1&gt;")).toBe("АТБ & Co <1>");
    expect(decodeXmlEntities("&#8212;")).toBe("—");
    expect(decodeXmlEntities("&#x2014;")).toBe("—");
    expect(decodeXmlEntities("&nbsp;")).toBe(" ");
  });

  it("лишає невідому сутність як є, не зʼїдаючи текст", () => {
    expect(decodeXmlEntities("&невідомо;")).toBe("&невідомо;");
    expect(decodeXmlEntities("&#x110000;")).toBe("&#x110000;");
  });

  it("рядок без '&' повертається без роботи", () => {
    expect(decodeXmlEntities("Сільпо")).toBe("Сільпо");
  });
});

describe("columnRefToIndex", () => {
  it.each([
    ["A1", 0],
    ["B12", 1],
    ["Z9", 25],
    ["AA1", 26],
    ["BC12", 54],
  ])("%s → %i", (ref, expected) => {
    expect(columnRefToIndex(ref)).toBe(expected);
  });
});

describe("excelSerialToDateString", () => {
  it("серіал без дробової частини → чиста дата", () => {
    expect(excelSerialToDateString(46250)).toBe("2026-08-16");
  });

  it("дробова частина стає часом", () => {
    expect(excelSerialToDateString(46250.5)).toBe("2026-08-16 12:00");
  });

  it("позамежні значення не вигадують дату", () => {
    expect(excelSerialToDateString(0)).toBeNull();
    expect(excelSerialToDateString(-5)).toBeNull();
    expect(excelSerialToDateString(9_999_999)).toBeNull();
    expect(excelSerialToDateString(Number.NaN)).toBeNull();
  });
});

describe("canonicalNumberString", () => {
  it("прибирає шум плаваючої крапки", () => {
    // Шум РАХУЄМО, а не пишемо літералом: точний літерал
    // `-1234.5600000000001` не представний у double, і `no-loss-of-precision`
    // справедливо його забороняє. Обчислення дає той самий ефект, який
    // реально приїжджає з XLSX.
    expect(canonicalNumberString(0.1 + 0.2)).toBe("0.3");
    expect(canonicalNumberString(-(1234.56 * 3))).toBe("-3703.68");
  });

  it("цілі лишаються цілими, без експоненти", () => {
    expect(canonicalNumberString(20000)).toBe("20000");
    expect(canonicalNumberString(0)).toBe("0");
  });

  it("не-число дає порожній рядок", () => {
    expect(canonicalNumberString(Number.POSITIVE_INFINITY)).toBe("");
  });
});

// ─────────────────────────── Читання аркуша ──────────────────────────────

/** Збирає XLSX з довільним XML аркуша — для типів клітинок, яких
 * `makeXlsx` не вміє (formula-string, boolean, error, ISO-дата). */
function xlsxWithSheet(
  sheetInner: string,
  extra?: { styles?: string },
): Buffer {
  const parts = [
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<workbook xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "utf8",
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
        "utf8",
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(
        `<worksheet><sheetData>${sheetInner}</sheetData></worksheet>`,
        "utf8",
      ),
    },
  ];
  if (extra?.styles) {
    parts.push({
      name: "xl/styles.xml",
      data: Buffer.from(extra.styles, "utf8"),
    });
  }
  return makeZip(parts);
}

describe("xlsxToGrid — типи клітинок", () => {
  it("читає inline-рядок, формульний рядок, булеве й помилку", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(
        `<row r="1">` +
          `<c r="A1" t="inlineStr"><is><t>Сільпо</t></is></c>` +
          `<c r="B1" t="str"><v>формула</v></c>` +
          `<c r="C1" t="b"><v>1</v></c>` +
          `<c r="D1" t="b"><v>0</v></c>` +
          `<c r="E1" t="e"><v>#N/A</v></c>` +
          `<c r="F1" t="d"><v>2026-08-16</v></c>` +
          `</row>`,
      ),
    );
    expect(grid[0]).toEqual([
      "Сільпо",
      "формула",
      "TRUE",
      "FALSE",
      "",
      "2026-08-16",
    ]);
  });

  it("атрибути в одинарних лапках читаються так само", () => {
    // XML дозволяє обидві лапки. Читаючи лише подвійні, ми не бачили б
    // ні `r`, ні `t`: клітинка стала б числовою і сіла б у «наступну
    // вільну» позицію — тобто C1 переїхала б на B1.
    const grid = xlsxToGrid(
      xlsxWithSheet(
        `<row r='1'>` +
          `<c r='A1' t='inlineStr'><is><t>Сільпо</t></is></c>` +
          `<c r='C1' t='str'><v>формула</v></c>` +
          `</row>`,
      ),
    );
    expect(grid[0]).toEqual(["Сільпо", "", "формула"]);
  });

  it("атрибути, розділені табом і переносом рядка, читаються", () => {
    // XML не вимагає саме U+0020 між атрибутами. Генератор, що пише тег
    // у кілька рядків або з табами, — валідний XLSX; приймаючи лише
    // пробіл, ми не бачили б `r` і мовчки зсували б колонки. Перша
    // клітинка навмисно B1, а не A1: без `r` вона сіла б у «наступну
    // вільну» позицію 0, і різниця була б непомітна.
    const grid = xlsxToGrid(
      xlsxWithSheet(
        `<row\tr="1">` +
          `<c\tr="B1"\tt="inlineStr"><is><t>Сільпо</t></is></c>` +
          `<c\n\tr="D1"\n\tt="str"><v>формула</v></c>` +
          `</row>`,
      ),
    );
    expect(grid[0]).toEqual(["", "Сільпо", "", "формула"]);
  });

  it("пробіли навколо `=` не ховають атрибут", () => {
    // XML: `Eq ::= S? '=' S?` — `<c r = "B1">` цілком валідний. Знову
    // B1/D1, а не A1/B1: без прочитаного `r` клітинки сіли б у 0 і 1,
    // і зсув був би невидимий.
    const grid = xlsxToGrid(
      xlsxWithSheet(
        `<row r = "1">` +
          `<c r = "B1" t = "inlineStr"><is><t>Сільпо</t></is></c>` +
          `<c r\t=\t'D1' t = 'str'><v>формула</v></c>` +
          `</row>`,
      ),
    );
    expect(grid[0]).toEqual(["", "Сільпо", "", "формула"]);
  });

  it("клітинки без атрибута `r` йдуть по порядку", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(`<row r="1"><c><v>1</v></c><c><v>2</v></c></row>`),
    );
    expect(grid[0]).toEqual(["1", "2"]);
  });

  it("порожня клітинка й нечислове значення не валять розбір", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(
        `<row r="1"><c r="A1"/><c r="B1"><v>не число</v></c></row>`,
      ),
    );
    expect(grid[0]).toEqual(["", "не число"]);
  });

  it("посилання на відсутній спільний рядок дає порожню клітинку", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(`<row r="1"><c r="A1" t="s"><v>42</v></c></row>`),
    );
    expect(grid[0]).toEqual([""]);
  });

  it("самозакривний `<row/>` дає порожній рядок, а не падіння", () => {
    const grid = xlsxToGrid(xlsxWithSheet(`<row r="1"/>`));
    expect(grid).toEqual([[]]);
  });
});

describe("xlsxToGrid — датові стилі", () => {
  const DATE_ROW = `<row r="1"><c r="A1" s="1"><v>46250</v></c></row>`;

  it("вбудований датовий numFmtId (14) конвертує серіал", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(DATE_ROW, {
        styles: `<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      }),
    );
    expect(grid[0]).toEqual(["2026-08-16"]);
  });

  it("кастомний формат у САМОЗАКРИВНОМУ <numFmt/>", () => {
    const grid = xlsxToGrid(
      xlsxWithSheet(DATE_ROW, {
        styles:
          `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts>` +
          `<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
      }),
    );
    expect(grid[0]).toEqual(["2026-08-16"]);
  });

  it("кастомний формат у ПАРНОМУ <numFmt></numFmt> — теж датовий", () => {
    // Excel пише самозакривну форму, але інший генератор може писати
    // парну; без цього рядок приїхав би Excel-серіалом «46250».
    const grid = xlsxToGrid(
      xlsxWithSheet(DATE_ROW, {
        styles:
          `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"></numFmt></numFmts>` +
          `<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
      }),
    );
    expect(grid[0]).toEqual(["2026-08-16"]);
  });

  it("грошовий формат із літералом «грн» датовим НЕ вважається", () => {
    // Літерали в лапках не мають робити формат датовим — інакше сума
    // перетворилась би на дату.
    const grid = xlsxToGrid(
      xlsxWithSheet(DATE_ROW, {
        styles:
          `<styleSheet><numFmts><numFmt numFmtId="165" formatCode="0.00&quot; грн&quot;"/></numFmts>` +
          `<cellXfs><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs></styleSheet>`,
      }),
    );
    expect(grid[0]).toEqual(["46250"]);
  });

  it("без styles.xml числа лишаються числами", () => {
    const grid = xlsxToGrid(xlsxWithSheet(DATE_ROW));
    expect(grid[0]).toEqual(["46250"]);
  });
});

describe("xlsxToGrid — вибір аркуша й помилки", () => {
  it("падає на sheet1.xml, коли workbook.xml відсутній", () => {
    const grid = xlsxToGrid(
      makeZip([
        {
          name: "xl/worksheets/sheet1.xml",
          data: Buffer.from(
            `<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>`,
            "utf8",
          ),
        },
      ]),
    );
    expect(grid[0]).toEqual(["7"]);
  });

  it("бере ПЕРШИЙ аркуш за числовим порядком, не за алфавітним", () => {
    const sheet = (v: string) =>
      Buffer.from(
        `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${v}</t></is></c></row></sheetData></worksheet>`,
        "utf8",
      );
    const grid = xlsxToGrid(
      makeZip([
        { name: "xl/worksheets/sheet10.xml", data: sheet("десятий") },
        { name: "xl/worksheets/sheet2.xml", data: sheet("другий") },
        { name: "xl/worksheets/sheet1.xml", data: sheet("перший") },
      ]),
    );
    expect(grid[0]).toEqual(["перший"]);
  });

  it("не-ZIP відкидається до розбору", () => {
    expect(() => xlsxToGrid(Buffer.from("не zip", "utf8"))).toThrow(
      XlsxFormatError,
    );
  });

  it("побитий ZIP дає XlsxFormatError, а не сиру ZIP-помилку", () => {
    const broken = makeZip([
      { name: "xl/workbook.xml", data: Buffer.from("x") },
    ]);
    broken.writeUInt32LE(0xdeadbeef, broken.length - 22);
    expect(() => xlsxToGrid(broken)).toThrow(XlsxFormatError);
  });

  it("ZIP без частин xl/ — не книга Excel", () => {
    expect(() =>
      xlsxToGrid(makeZip([{ name: "readme.txt", data: Buffer.from("hi") }])),
    ).toThrow(/не XLSX/);
  });

  it("книга без жодного аркуша", () => {
    expect(() =>
      xlsxToGrid(
        makeZip([
          { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") },
        ]),
      ),
    ).toThrow(/жодного аркуша/);
  });
});

describe("isXlsxZip", () => {
  it("відрізняє книгу від довільного архіву", () => {
    expect(
      isXlsxZip(
        readZip(
          makeZip([{ name: "xl/workbook.xml", data: Buffer.from("<w/>") }]),
        ),
      ),
    ).toBe(true);
    expect(
      isXlsxZip(readZip(makeZip([{ name: "a.txt", data: Buffer.from("a") }]))),
    ).toBe(false);
  });
});
