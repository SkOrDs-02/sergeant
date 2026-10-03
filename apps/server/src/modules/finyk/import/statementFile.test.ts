import { describe, it, expect } from "vitest";
import {
  decodeStatementText,
  detectDelimiterByStructure,
  gridFromCsvText,
  gridFromStatementFile,
  locateHeaderRow,
  STATEMENT_MAX_FILE_BYTES,
} from "./statementFile.js";
import {
  makeXlsx,
  makeZip,
} from "@sergeant/tabular-import/__fixtures__/makeXlsx";
import {
  HtmlFormatError,
  htmlTableToGrid,
  looksLikeHtmlTable,
} from "@sergeant/tabular-import";
import { ValidationError } from "../../../obs/errors.js";

/** 2026-08-16 у serial-нумерації Excel (епоха 1899-12-30). */
const SERIAL_2026_08_16 = 46250;

describe("decodeStatementText", () => {
  it("читає UTF-8 з BOM", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Дата;Сума", "utf8"),
    ]);
    expect(decodeStatementText(bytes)).toBe("Дата;Сума");
  });

  it("падає назад на windows-1251, коли байти не валідний UTF-8", () => {
    // «Дата» у cp1251 — рівно ті байти, які браузерний `file.text()`
    // перетворив би на сміття, читаючи їх як UTF-8.
    const cp1251 = Buffer.from([0xc4, 0xe0, 0xf2, 0xe0]);
    expect(decodeStatementText(cp1251)).toBe("Дата");
  });
});

describe("detectDelimiterByStructure", () => {
  it("обирає ';' попри кому в преамбулі", () => {
    const text = [
      "Виписка за період 01.08.2026, 25.08.2026",
      "Дата;Опис операції;Сума в валюті рахунку;Валюта рахунку",
      "16.08.2026;АТБ;-123,45;UAH",
      "17.08.2026;Сільпо;-67,89;UAH",
    ].join("\n");
    expect(detectDelimiterByStructure(text)).toBe(";");
  });

  it("обирає таб для tab-separated експорту", () => {
    const text = "Дата\tОпис\tСума\n16.08.2026\tАТБ\t-123.45\n";
    expect(detectDelimiterByStructure(text)).toBe("\t");
  });
});

describe("locateHeaderRow", () => {
  it("знаходить заголовок під преамбулою виписки", () => {
    const rows = [
      ["Виписка з рахунку", "", ""],
      ["Період: 01.08.2026 — 25.08.2026", "", ""],
      [],
      ["Дата", "Опис операції", "Сума в валюті рахунку"],
      ["16.08.2026", "АТБ", "-123,45"],
    ];
    expect(locateHeaderRow(rows)).toBe(3);
  });

  it("без жодного знайомого слова бере перший непорожній рядок", () => {
    const rows = [[], ["a", "b", "c"], ["1", "2", "3"]];
    expect(locateHeaderRow(rows)).toBe(1);
  });

  it("багатослівний рядок даних не перебиває перший рядок файлу без заголовка", () => {
    // Виписка БЕЗ шапки: якби евристика зважала на «багато тексту», вона
    // обрала б рядок 1 і мовчки зʼїла б перший платіж.
    const rows = [
      ["16.08.2026", "АТБ", "-123,45"],
      ["17.08.2026", "Оплата послуг звʼязку Київстар передплата", "-250,00"],
      ["18.08.2026", "Сільпо", "-67,89"],
    ];
    expect(locateHeaderRow(rows)).toBe(0);
  });
});

describe("gridFromStatementFile — XLSX", () => {
  const xlsx = makeXlsx({
    sharedStrings: [
      "Виписка з картки",
      "Дата",
      "Опис операції",
      "Сума в валюті рахунку",
      "Валюта рахунку",
      "АТБ-Маркет",
      "UAH",
      "Зарплата",
    ],
    rows: [
      [{ kind: "shared", index: 0 }],
      [],
      [
        { kind: "shared", index: 1 },
        { kind: "shared", index: 2 },
        { kind: "shared", index: 3 },
        { kind: "shared", index: 4 },
      ],
      [
        { kind: "date", serial: SERIAL_2026_08_16 },
        { kind: "shared", index: 5 },
        { kind: "number", value: -123.45 },
        { kind: "shared", index: 6 },
      ],
      [
        { kind: "date", serial: SERIAL_2026_08_16 + 1 },
        { kind: "shared", index: 7 },
        { kind: "number", value: 20000 },
        { kind: "shared", index: 6 },
      ],
    ],
  });

  it("читає аркуш, пропускає преамбулу і канонізує дату й суму", () => {
    const grid = gridFromStatementFile(xlsx);
    expect(grid.sourceKind).toBe("sheet");
    expect(grid.headerRowIndex).toBe(2);
    expect(grid.rows[2]).toEqual([
      "Дата",
      "Опис операції",
      "Сума в валюті рахунку",
      "Валюта рахунку",
    ]);
    expect(grid.rows[3]).toEqual([
      "2026-08-16",
      "АТБ-Маркет",
      "-123.45",
      "UAH",
    ]);
    expect(grid.rows[4]?.[2]).toBe("20000");
  });

  it("тримає колонки на місці, коли клітинки пропущені у файлі", () => {
    const sparse = makeXlsx({
      sharedStrings: ["Дата", "Опис", "Сума", "АТБ"],
      rows: [
        [
          { kind: "shared", index: 0 },
          { kind: "shared", index: 1 },
          { kind: "shared", index: 2 },
        ],
        // Друга колонка фізично відсутня в XML — ридер мусить лишити її
        // порожньою, а не зсунути суму на місце опису.
        [
          { kind: "date", serial: SERIAL_2026_08_16 },
          { kind: "empty" },
          { kind: "number", value: -10 },
        ],
      ],
    });
    expect(gridFromStatementFile(sparse).rows[1]).toEqual([
      "2026-08-16",
      "",
      "-10",
    ]);
  });

  it("ZIP без частин xl/ — зрозуміла відмова, не мовчазний нуль рядків", () => {
    const notXlsx = makeZip([
      { name: "readme.txt", data: Buffer.from("hello", "utf8") },
    ]);
    expect(() => gridFromStatementFile(notXlsx)).toThrow(ValidationError);
  });
});

describe("gridFromStatementFile — інші формати", () => {
  it("читає HTML-таблицю, яку банк віддає під іменем .xls", () => {
    const html = `<html><body><table>
      <tr><td colspan="2">Виписка</td></tr>
      <tr><th>Дата</th><th>Опис операції</th><th>Сума</th></tr>
      <tr><td>16.08.2026</td><td>АТБ&nbsp;Маркет</td><td>-1&nbsp;234,56</td></tr>
    </table></body></html>`;
    const grid = gridFromStatementFile(Buffer.from(html, "utf8"));
    expect(grid.sourceKind).toBe("csv");
    expect(grid.headerRowIndex).toBe(1);
    expect(grid.rows[2]).toEqual(["16.08.2026", "АТБ Маркет", "-1 234,56"]);
  });

  it("HTML, який не піддається чистці, стає зрозумілою відмовою", () => {
    const html =
      "<table><tr><td>" +
      "<sc".repeat(12) +
      "<script>a</script>" +
      "ript>x</script>".repeat(12) +
      "</td></tr></table>";
    expect(() => gridFromStatementFile(Buffer.from(html, "utf8"))).toThrow(
      /Не вдалось прочитати таблицю/,
    );
  });

  it("бінарний .xls (Excel 97) — відмова з інструкцією", () => {
    const ole2 = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
    ]);
    expect(() => gridFromStatementFile(ole2)).toThrow(/Excel 97/);
  });

  it("PDF — відмова з інструкцією", () => {
    expect(() =>
      gridFromStatementFile(Buffer.from("%PDF-1.4\n%binary", "latin1")),
    ).toThrow(/PDF/);
  });

  it("звичайний CSV у cp1251 читається кирилицею", () => {
    const csv =
      "Дата;Опис операції;Сума в валюті рахунку\n16.08.2026;АТБ;-12,50\n";
    // Українські літери поза спільним кириличним блоком мають у cp1251
    // власні позиції — без них «ї»/«і» перетворюються на латиницю, і тест
    // перевіряв би не те, що треба.
    const CP1251_EXTRA: Record<string, number> = {
      "\u0404": 0xaa,
      "\u0454": 0xba,
      "\u0406": 0xb2,
      "\u0456": 0xb3,
      "\u0407": 0xaf,
      "\u0457": 0xbf,
      "\u0490": 0xa5,
      "\u0491": 0xb4,
    };
    const bytes = Buffer.from(
      new Uint8Array(
        [...csv].map((ch) => {
          const extra = CP1251_EXTRA[ch];
          if (extra !== undefined) return extra;
          const code = ch.codePointAt(0)!;
          // Кириличний блок U+0410..U+044F лягає в cp1251 як 0xC0..0xFF.
          return code >= 0x410 && code <= 0x44f ? code - 0x410 + 0xc0 : code;
        }),
      ),
    );
    const grid = gridFromStatementFile(bytes);
    expect(grid.rows[0]).toEqual([
      "Дата",
      "Опис операції",
      "Сума в валюті рахунку",
    ]);
  });
});

describe("gridFromCsvText", () => {
  it("лишається текстовим шляхом із заголовком у першому рядку", () => {
    const grid = gridFromCsvText("Дата,Сума,Опис\n16.08.2026,-10.00,АТБ\n");
    expect(grid).toMatchObject({ sourceKind: "csv", headerRowIndex: 0 });
    expect(grid.rows).toHaveLength(2);
  });
});

// ─────────── HTML-таблиця: очищення тегів і зсув колонок ────────────────

describe("htmlTableToGrid — санітизація та colspan", () => {
  it("вкладений <script> не переживає чистку", () => {
    // Один прохід `<script>…</script>` з лінивим тілом зупиняється на
    // ПЕРШОМУ `</script>` і лишає зовнішній тег — саме про це CodeQL
    // «Incomplete multi-character sanitization». Чистка до нерухомої
    // точки прибирає обидва рівні.
    const grid = htmlTableToGrid(
      `<table><tr><td>Сільпо<script><script>alert(1)</script></script></td></tr></table>`,
    );
    expect(grid[0]?.[0]).not.toContain("script");
    expect(grid[0]?.[0]).toBe("Сільпо");
  });

  it("розірваний тег не лишає по собі «<script»", () => {
    const grid = htmlTableToGrid(
      `<table><tr><td>АТБ<scr<script>ipt>alert(1)</script></td></tr></table>`,
    );
    // Хвіст `<scr` лишається як звичайний текст — це не тег і розбору
    // колонок не псує; важливо, що працездатного `<script` немає.
    expect(grid[0]?.[0]).not.toContain("<script");
  });

  it("прибирає вміст <script>/<style> цілком", () => {
    const html =
      `<table><style>td{color:red}</style><tr><td>Сільпо</td>` +
      `<td><script>var x=1</script>-100</td></tr></table>`;
    expect(htmlTableToGrid(html)[0]).toEqual(["Сільпо", "-100"]);
  });

  it("розгортає colspan у подвійних, одинарних лапках і без лапок", () => {
    const grid = htmlTableToGrid(
      `<table>` +
        `<tr><td colspan="2">A</td><td>B</td></tr>` +
        `<tr><td colspan='2'>C</td><td>D</td></tr>` +
        `<tr><td colspan=2>E</td><td>F</td></tr>` +
        `</table>`,
    );
    // Без підтримки одинарних лапок другий рядок зʼїхав би на колонку.
    expect(grid).toEqual([
      ["A", "", "B"],
      ["C", "", "D"],
      ["E", "", "F"],
    ]);
  });

  it("<br> стає пробілом, а не склеює слова", () => {
    expect(
      htmlTableToGrid(`<table><tr><td>АТБ<br/>Маркет</td></tr></table>`)[0],
    ).toEqual(["АТБ Маркет"]);
  });

  it("рядок без власних клітинок у сітку не потрапляє", () => {
    const grid = htmlTableToGrid(
      `<table><tr><td>справжній</td></tr><tr></tr></table>`,
    );
    expect(grid).toEqual([["справжній"]]);
  });

  it("вкладеність, що не сходиться за стелю проходів, — відмова", () => {
    // Кожен прохід відкриває рівно один наступний `<script>`: вирізаний
    // блок склеює `<sc` з `ript>…</script>`. Сім рівнів чистка ще
    // добиває, вісім — уже ні, і тоді це відмова, а не квадратичний CPU
    // на 5-мегабайтному вході.
    const nest = (n: number) =>
      "<table><tr><td>" +
      "<sc".repeat(n) +
      "<script>a</script>" +
      "ript>x</script>".repeat(n) +
      "</td></tr></table>";
    expect(htmlTableToGrid(nest(7))[0]).toEqual([""]);
    expect(() => htmlTableToGrid(nest(12))).toThrow(HtmlFormatError);
  });

  it("документ без таблиці дає порожню сітку", () => {
    expect(htmlTableToGrid("<html><body><p>нічого</p></body></html>")).toEqual(
      [],
    );
  });
});

describe("looksLikeHtmlTable", () => {
  it("шукає <table> лише в початку файлу", () => {
    expect(looksLikeHtmlTable("<html><table>")).toBe(true);
    expect(looksLikeHtmlTable("Дата;Сума\n01.01.2026;-10")).toBe(false);
  });
});

describe("gridFromStatementFile — межі входу", () => {
  it("порожній буфер", () => {
    expect(() => gridFromStatementFile(Buffer.alloc(0))).toThrow(
      /Порожній файл/,
    );
  });

  it("файл понад 5 МБ відкидається до розбору", () => {
    expect(() =>
      gridFromStatementFile(Buffer.alloc(STATEMENT_MAX_FILE_BYTES + 1)),
    ).toThrow(/завеликий/);
  });

  it("файл з самих пробілів — теж порожній", () => {
    expect(() =>
      gridFromStatementFile(Buffer.from("   \n\t ", "utf8")),
    ).toThrow(/Порожній файл/);
  });

  it("HTML без жодного рядка таблиці — зрозуміла відмова", () => {
    expect(() =>
      gridFromStatementFile(
        Buffer.from("<html><table></table></html>", "utf8"),
      ),
    ).toThrow(/немає таблиці з операціями/);
  });
});
