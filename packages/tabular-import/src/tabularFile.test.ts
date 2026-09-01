import { describe, expect, it } from "vitest";
import { makeXlsx, makeZip } from "./__fixtures__/makeXlsx.js";
import {
  decodeTabularText,
  detectDelimiterByStructure,
  gridFromCsvText,
  gridFromTabularFile,
  locateHeaderRow,
  TABULAR_MAX_FILE_BYTES,
  TabularImportError,
} from "./tabularFile.js";

const HEADER_HINTS = ["date", "amount", "description"] as const;
const SERIAL_2026_08_16 = 46250;

function expectTabularCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(TabularImportError);
    expect((err as TabularImportError).code).toBe(code);
    return;
  }
  throw new Error("Очікували TabularImportError");
}

describe("decodeTabularText", () => {
  it("читає UTF-8 з BOM", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Date;Amount", "utf8"),
    ]);
    expect(decodeTabularText(bytes)).toBe("Date;Amount");
  });

  it("падає назад на windows-1251, коли байти не валідний UTF-8", () => {
    const cp1251 = Buffer.from([0xc4, 0xe0, 0xf2, 0xe0]);
    expect(decodeTabularText(cp1251)).toBe("Дата");
  });
});

describe("detectDelimiterByStructure", () => {
  it("обирає ';' попри кому в преамбулі", () => {
    const text = [
      "Export period 01.08.2026, 25.08.2026",
      "Date;Description;Amount;Note",
      "16.08.2026;A;-123,45;ok",
      "17.08.2026;B;-67,89;ok",
    ].join("\n");
    expect(detectDelimiterByStructure(text)).toBe(";");
  });

  it("обирає таб для tab-separated експорту", () => {
    const text = "Date\tDescription\tAmount\n16.08.2026\tA\t-123.45\n";
    expect(detectDelimiterByStructure(text)).toBe("\t");
  });
});

describe("locateHeaderRow", () => {
  it("знаходить заголовок під преамбулою", () => {
    const rows = [
      ["Export", "", ""],
      ["Period: 01.08.2026 - 25.08.2026", "", ""],
      [],
      ["Date", "Description", "Amount"],
      ["16.08.2026", "A", "-123,45"],
    ];
    expect(locateHeaderRow(rows, HEADER_HINTS)).toBe(3);
  });

  it("без жодного знайомого слова бере перший непорожній рядок", () => {
    const rows = [[], ["a", "b", "c"], ["1", "2", "3"]];
    expect(locateHeaderRow(rows, HEADER_HINTS)).toBe(1);
  });
});

describe("gridFromTabularFile", () => {
  it("читає XLSX і повертає sheet-grid", () => {
    const xlsx = makeXlsx({
      sharedStrings: ["Export", "Date", "Description", "Amount", "A"],
      rows: [
        [{ kind: "shared", index: 0 }],
        [
          { kind: "shared", index: 1 },
          { kind: "shared", index: 2 },
          { kind: "shared", index: 3 },
        ],
        [
          { kind: "date", serial: SERIAL_2026_08_16 },
          { kind: "shared", index: 4 },
          { kind: "number", value: -123.45 },
        ],
      ],
    });

    const grid = gridFromTabularFile(xlsx, HEADER_HINTS);
    expect(grid.sourceKind).toBe("sheet");
    expect(grid.headerRowIndex).toBe(1);
    expect(grid.rows[2]).toEqual(["2026-08-16", "A", "-123.45"]);
  });

  it("читає HTML-таблицю як csv-grid", () => {
    const html = `<html><body><table>
      <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
      <tr><td>16.08.2026</td><td>A&nbsp;B</td><td>-1&nbsp;234,56</td></tr>
    </table></body></html>`;
    const grid = gridFromTabularFile(Buffer.from(html, "utf8"), HEADER_HINTS);
    expect(grid.sourceKind).toBe("csv");
    expect(grid.headerRowIndex).toBe(0);
    expect(grid.rows[1]).toEqual(["16.08.2026", "A B", "-1 234,56"]);
  });

  it("читає текстовий CSV", () => {
    const grid = gridFromTabularFile(
      Buffer.from("Date,Amount,Description\n2026-08-16,-10.00,A\n", "utf8"),
      HEADER_HINTS,
    );
    expect(grid).toMatchObject({ sourceKind: "csv", headerRowIndex: 0 });
    expect(grid.rows).toHaveLength(2);
  });

  it("повертає коди помилок для меж і форматів", () => {
    expectTabularCode(
      () => gridFromTabularFile(Buffer.alloc(0), HEADER_HINTS),
      "empty_file",
    );
    expectTabularCode(
      () =>
        gridFromTabularFile(
          Buffer.alloc(TABULAR_MAX_FILE_BYTES + 1),
          HEADER_HINTS,
        ),
      "too_large",
    );
    expectTabularCode(
      () =>
        gridFromTabularFile(
          Buffer.from("%PDF-1.4\n%binary", "latin1"),
          HEADER_HINTS,
        ),
      "pdf_not_supported",
    );
  });

  it("повертає код для старого XLS", () => {
    const ole2 = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
    ]);
    expectTabularCode(
      () => gridFromTabularFile(ole2, HEADER_HINTS),
      "legacy_xls",
    );
  });

  it("повертає код для нечитабельної книги", () => {
    const notXlsx = makeZip([
      { name: "readme.txt", data: Buffer.from("hello", "utf8") },
    ]);
    expectTabularCode(
      () => gridFromTabularFile(notXlsx, HEADER_HINTS),
      "unreadable_workbook",
    );
  });

  it("повертає код для нечитабельної HTML-таблиці", () => {
    const html =
      "<table><tr><td>" +
      "<sc".repeat(12) +
      "<script>a</script>" +
      "ript>x</script>".repeat(12) +
      "</td></tr></table>";
    expectTabularCode(
      () => gridFromTabularFile(Buffer.from(html, "utf8"), HEADER_HINTS),
      "unreadable_table",
    );
  });

  it("повертає код, якщо HTML не містить рядків таблиці", () => {
    expectTabularCode(
      () =>
        gridFromTabularFile(
          Buffer.from("<html><table></table></html>", "utf8"),
          HEADER_HINTS,
        ),
      "no_table",
    );
  });
});

describe("gridFromCsvText", () => {
  it("лишається окремим текстовим входом", () => {
    const grid = gridFromCsvText(
      "Date,Amount,Description\n2026-08-16,-10.00,A\n",
      HEADER_HINTS,
    );
    expect(grid).toMatchObject({ sourceKind: "csv", headerRowIndex: 0 });
    expect(grid.rows).toHaveLength(2);
  });
});
