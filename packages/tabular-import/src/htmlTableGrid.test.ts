import { describe, expect, it } from "vitest";
import {
  HtmlFormatError,
  htmlTableToGrid,
  looksLikeHtmlTable,
} from "./htmlTableGrid.js";

describe("htmlTableToGrid", () => {
  it("читає звичайну HTML-таблицю", () => {
    const html = `<table>
      <tr><th>Дата</th><th>Опис</th><th>Сума</th></tr>
      <tr><td>2026-08-16</td><td>Кава&nbsp;ранкова</td><td>-123,45</td></tr>
    </table>`;

    expect(htmlTableToGrid(html)).toEqual([
      ["Дата", "Опис", "Сума"],
      ["2026-08-16", "Кава ранкова", "-123,45"],
    ]);
  });

  it("збирає кілька таблиць з одного файлу", () => {
    const html =
      `<table><tr><td>перша</td><td>1</td></tr></table>` +
      `<p>між таблицями</p>` +
      `<table><tr><td>друга</td><td>2</td></tr></table>`;

    expect(htmlTableToGrid(html)).toEqual([
      ["перша", "1"],
      ["друга", "2"],
    ]);
  });

  it("кидає HtmlFormatError, коли чистка розмітки не сходиться", () => {
    const html =
      "<table><tr><td>" +
      "<sc".repeat(12) +
      "<script>a</script>" +
      "ript>x</script>".repeat(12) +
      "</td></tr></table>";

    expect(() => htmlTableToGrid(html)).toThrow(HtmlFormatError);
  });

  it("повертає порожній результат, якщо таблиці немає", () => {
    expect(
      htmlTableToGrid("<html><body><p>немає таблиці</p></body></html>"),
    ).toEqual([]);
  });
});

describe("looksLikeHtmlTable", () => {
  it("впізнає HTML з таблицею", () => {
    expect(
      looksLikeHtmlTable("<html><body><table></table></body></html>"),
    ).toBe(true);
  });

  it("не плутає CSV з HTML-таблицею", () => {
    expect(looksLikeHtmlTable("Дата;Опис;Сума\n2026-08-16;Кава;-123,45")).toBe(
      false,
    );
  });
});
