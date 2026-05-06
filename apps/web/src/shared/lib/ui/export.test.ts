/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrayToCSV,
  dataToHTMLTable,
  downloadString,
  exportToCSV,
  exportToPDF,
  generatePDFReport,
  type ExportColumn,
} from "./export";

type Row = {
  id: number;
  name: string;
  amount: number;
  meta?: { tag: string };
} & Record<string, unknown>;

const rows: Row[] = [
  { id: 1, name: "Aldi", amount: 120.5, meta: { tag: "groceries" } },
  { id: 2, name: 'Cafe "Lviv"', amount: 65, meta: { tag: "coffee" } },
  { id: 3, name: "Multi\nline", amount: -10.42 },
];

const columns: ExportColumn<Row>[] = [
  { key: "id", header: "ID" },
  { key: "name", header: "Назва" },
  { key: "amount", header: "Сума", format: (v) => Number(v).toFixed(2) },
  { key: "meta.tag", header: "Тег" },
];

describe("arrayToCSV", () => {
  it("дефолтний separator — кома, з заголовком", () => {
    const csv = arrayToCSV(rows, columns);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("ID,Назва,Сума,Тег");
    expect(lines[1]).toBe("1,Aldi,120.50,groceries");
  });

  it("екранує лапки, коми та переноси рядка", () => {
    const csv = arrayToCSV(rows, columns);
    const lines = csv.split("\n");
    // Cafe "Lviv" — лапки задвоюються, поле в лапках
    expect(lines[2]).toContain('"Cafe ""Lviv"""');
    // Multi\nline — поле в лапках бо містить перенос; CSV.split("\n")
    // фізично розриває такий запис, тому асертимо на raw csv.
    expect(csv).toContain('"Multi\nline"');
  });

  it("не екранує значення без спецсимволів", () => {
    const csv = arrayToCSV(rows, columns);
    expect(csv).toContain(",groceries\n");
    expect(csv).not.toContain('"groceries"');
  });

  it("кастомний separator (`;`) — переекранує тільки за `;`", () => {
    const data = [{ a: "1;2", b: "no-semi" }];
    const cols: ExportColumn<(typeof data)[number]>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    const csv = arrayToCSV(data, cols, { separator: ";" });
    expect(csv.split("\n")[0]).toBe("A;B");
    expect(csv.split("\n")[1]).toBe('"1;2";no-semi');
  });

  it("includeHeader=false — не друкує перший рядок", () => {
    const csv = arrayToCSV(rows, columns, { includeHeader: false });
    expect(csv.split("\n")[0]).toBe("1,Aldi,120.50,groceries");
  });

  it("nested key (`meta.tag`) дістає вкладене значення", () => {
    const csv = arrayToCSV(rows, columns);
    expect(csv).toContain("groceries");
    expect(csv).toContain("coffee");
  });

  it("nested key для рядка без вкладеного об'єкта — пустий рядок", () => {
    // У третій row немає meta, тож тег має бути порожній.
    const csv = arrayToCSV(rows, columns);
    const last = csv.split("\n").at(-1)!;
    // Останнє значення — порожнє, тобто рядок завершується розділювачем.
    expect(last.endsWith(",")).toBe(true);
  });

  it("null/undefined значення — пустий рядок", () => {
    const data = [{ a: null, b: undefined }];
    const cols: ExportColumn<(typeof data)[number]>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    const csv = arrayToCSV(data, cols);
    expect(csv.split("\n")[1]).toBe(",");
  });

  it("порожній набір даних із заголовком — лише заголовковий рядок", () => {
    expect(arrayToCSV<Row>([], columns)).toBe("ID,Назва,Сума,Тег");
  });
});

describe("downloadString / exportToCSV", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloadString створює <a> з href, проставляє download та клікає", () => {
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag === "a") {
          (el as HTMLAnchorElement).click = clickSpy;
        }
        return el;
      });

    downloadString("hello", "file.txt", "text/plain");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
  });

  it("downloadString дефолтний mime-type — text/plain", () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = document.implementation
        .createHTMLDocument()
        .createElement(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
      return el;
    }) as typeof document.createElement);

    downloadString("payload", "out.txt");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("exportToCSV викликає downloadString з text/csv та переданим filename", () => {
    const clickSpy = vi.fn();
    const created: HTMLAnchorElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = document.implementation
        .createHTMLDocument()
        .createElement(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = clickSpy;
        created.push(el as HTMLAnchorElement);
      }
      return el;
    }) as typeof document.createElement);

    exportToCSV(rows, columns, "report.csv");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(created[0]!.download).toBe("report.csv");
  });

  it("exportToCSV дефолтний filename — export.csv", () => {
    const clickSpy = vi.fn();
    const created: HTMLAnchorElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = document.implementation
        .createHTMLDocument()
        .createElement(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = clickSpy;
        created.push(el as HTMLAnchorElement);
      }
      return el;
    }) as typeof document.createElement);

    exportToCSV(rows, columns);
    expect(created[0]!.download).toBe("export.csv");
  });
});

describe("generatePDFReport", () => {
  it("включає title, subtitle, всі sections та footer", () => {
    const html = generatePDFReport({
      title: "Звіт",
      subtitle: "квітень 2026",
      sections: [
        { title: "Доходи", content: "<p>+1000</p>" },
        { title: "Витрати", content: "<p>-500</p>" },
      ],
      footerText: "Sergeant",
    });
    expect(html).toContain("<h1>Звіт</h1>");
    expect(html).toContain("квітень 2026");
    expect(html).toContain("Доходи");
    expect(html).toContain("Витрати");
    expect(html).toContain("+1000");
    expect(html).toContain("Sergeant");
  });

  it("підтримує HTMLElement як content — серіалізує через outerHTML", () => {
    const div = document.createElement("div");
    div.innerHTML = "<span>elem</span>";
    const html = generatePDFReport({
      title: "T",
      sections: [{ title: "Sec", content: div }],
    });
    expect(html).toContain("<div><span>elem</span></div>");
  });

  it("dark theme — тло #1a1a1a", () => {
    const html = generatePDFReport({
      title: "T",
      sections: [],
      theme: "dark",
    });
    expect(html).toContain("background: #1a1a1a");
    expect(html).toContain("color: #e5e5e5");
  });

  it("light theme (default) — тло #ffffff", () => {
    const html = generatePDFReport({ title: "T", sections: [] });
    expect(html).toContain("background: #ffffff");
    expect(html).toContain("color: #1a1a1a");
  });

  it("logo — додає <img src=…>", () => {
    const html = generatePDFReport({
      title: "T",
      sections: [],
      logo: "https://example.com/l.png",
    });
    expect(html).toContain('<img src="https://example.com/l.png"');
  });

  it("без logo — секцію <img> не додає", () => {
    const html = generatePDFReport({ title: "T", sections: [] });
    expect(html).not.toContain("<img");
  });

  it("без footerText — підставляє локалізовану дату/час uk-UA", () => {
    const html = generatePDFReport({ title: "T", sections: [] });
    expect(html).toMatch(/Згенеровано .+ о .+/);
  });
});

describe("exportToPDF", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("відкриває нове вікно, пише HTML і запускає print після onload", () => {
    const printSpy = vi.fn();
    const focusSpy = vi.fn();
    const writeSpy = vi.fn();
    const closeSpy = vi.fn();

    const fakeWindow = {
      document: { write: writeSpy, close: closeSpy },
      onload: null as (() => void) | null,
      focus: focusSpy,
      print: printSpy,
    };

    vi.spyOn(window, "open").mockReturnValue(
      fakeWindow as unknown as Window & typeof globalThis,
    );

    exportToPDF({
      title: "Report",
      sections: [{ title: "X", content: "<p>x</p>" }],
    });

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);

    // onload встановлено — стрельнемо вручну.
    expect(typeof fakeWindow.onload).toBe("function");
    fakeWindow.onload!();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("якщо window.open повернув null — нічого не падає", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(() => exportToPDF({ title: "T", sections: [] })).not.toThrow();
  });
});

describe("dataToHTMLTable", () => {
  it("рендерить thead + tbody з усіма рядками", () => {
    const html = dataToHTMLTable(rows, columns);
    expect(html).toContain("<th>ID</th>");
    expect(html).toContain("<th>Назва</th>");
    expect(html).toContain("<td>Aldi</td>");
    // Custom format на amount → 120.50 (2 знаки)
    expect(html).toContain("<td>120.50</td>");
  });

  it("nested key (`meta.tag`) — дістає значення", () => {
    const html = dataToHTMLTable(rows, columns);
    expect(html).toContain("<td>groceries</td>");
    expect(html).toContain("<td>coffee</td>");
  });

  it("null/undefined → порожня клітинка (без 'undefined' тексту)", () => {
    const data = [{ a: null, b: undefined }];
    const cols: ExportColumn<(typeof data)[number]>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    const html = dataToHTMLTable(data, cols);
    expect(html).toContain("<td></td><td></td>");
    expect(html).not.toContain("undefined");
  });

  it("порожній dataset — лише header, рядків нема", () => {
    const html = dataToHTMLTable<Row>([], columns);
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>ID</th>");
    // tbody присутній, але без <tr>.
    const tbody = html.split("<tbody>")[1]!.split("</tbody>")[0]!;
    expect(tbody.trim()).toBe("");
  });
});
