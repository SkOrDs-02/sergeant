/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Детекцію iOS standalone-PWA підміняємо: її власна поведінка пінована в
// `iosStandalone.test.ts`, а тут важить лише розвилка «Поділитись/завантажити».
const platform = vi.hoisted(() => ({ iosStandalone: false }));
vi.mock("@shared/lib/platform/iosStandalone", () => ({
  isIOSStandalonePWA: () => platform.iosStandalone,
}));

import {
  arrayToCSV,
  dataToHTMLTable,
  downloadString,
  exportToCSV,
  generatePDFReport,
  saveStringAsFile,
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

  it("nested key для рядка без вкладеного обʼєкта — пустий рядок", () => {
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloadString створює <a> з href, проставляє download та клікає", () => {
    vi.useFakeTimers();
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
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // URL відкликається, але не одразу (див. наступний тест).
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    createSpy.mockRestore();
  });

  // iOS Safari/PWA забирає blob уже після повернення з обробника кліку:
  // відкликаний одразу URL лишав застосунок «завислим» (звіт власника).
  it("downloadString не відкликає blob-URL одразу після кліку, а лише за хвилину", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = document.implementation
        .createHTMLDocument()
        .createElement(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = vi.fn();
      return el;
    }) as typeof document.createElement);

    downloadString("hello", "file.txt", "text/plain");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
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

    void exportToCSV(rows, columns, "report.csv");

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

    void exportToCSV(rows, columns);
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

  it("does not embed an in-report toolbar (controls live in the React preview modal)", () => {
    const html = generatePDFReport({ title: "T", sections: [] });
    // The old window.open flow baked a sticky toolbar + inline
    // onclick handlers into the report; the in-app PdfPreviewModal now
    // owns those controls, so the report HTML must stay chrome-free.
    expect(html).not.toContain(".print-preview-toolbar");
    expect(html).not.toContain("window.close()");
    expect(html).not.toContain("window.history.back()");
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

// Звіт власника 2026-10-01: у встановленому PWA на iPhone `<a download>` з
// blob-URL не качає файл, а водить застосунок на blob (без «назад») — він
// виглядає завислим. Там файл віддається через системне «Поділитись».
describe("saveStringAsFile — системне «Поділитись» в iOS PWA", () => {
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const clickSpy = vi.fn();
  const share = vi.fn();
  const canShare = vi.fn();

  // `readAsText` зрізає BOM при декодуванні, а нам треба довести, що він у
  // файлі: читаємо байти й декодуємо з `ignoreBOM`.
  const readText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(
          new TextDecoder("utf-8", { ignoreBOM: true }).decode(
            reader.result as ArrayBuffer,
          ),
        );
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });

  beforeEach(() => {
    platform.iosStandalone = true;
    createObjectURL.mockClear();
    clickSpy.mockClear();
    share.mockReset().mockResolvedValue(undefined);
    canShare.mockReset().mockReturnValue(true);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal("navigator", { share, canShare, userAgent: "" });
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = document.implementation
        .createHTMLDocument()
        .createElement(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    platform.iosStandalone = false;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("віддає файл через navigator.share, а не через <a download>", async () => {
    const result = await saveStringAsFile(
      "a,b\n1,2",
      "finyk-2026-09.csv",
      "text/csv",
    );

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]![0] as { files: File[] };
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.name).toBe("finyk-2026-09.csv");
    expect(arg.files[0]!.type).toBe("text/csv");
    // BOM лишається: Excel без нього читає UTF-8 як Windows-1251.
    expect(await readText(arg.files[0]!)).toBe("\uFEFFa,b\n1,2");
    // Саме `canShare` схвалив цей файл.
    expect(canShare).toHaveBeenCalledWith({ files: [arg.files[0]] });
    // Жодної навігації на blob.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("викликає navigator.share синхронно: iOS вимагає активації жесту, а await її з'їдає", () => {
    share.mockReturnValue(new Promise(() => {}));
    void saveStringAsFile("x", "x.csv", "text/csv");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("закриття аркуша (AbortError) — тиха відмова: ні завантаження, ні помилки", async () => {
    share.mockRejectedValue(new DOMException("canceled", "AbortError"));

    const result = await saveStringAsFile("x", "x.csv", "text/csv");

    expect(result).toBe("cancelled");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("AbortError, що не є DOMException, теж читається як скасування", async () => {
    const abort = new Error("canceled");
    abort.name = "AbortError";
    share.mockRejectedValue(abort);

    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("cancelled");
  });

  it.each([
    ["NotAllowedError", "немає активації жесту"],
    ["TypeError", "тип файла не підтримано"],
    ["DataError", "будь-яка інша відмова"],
  ])(
    "відмова share (%s: %s) — фолбек на завантаження, експорт не губиться",
    async (name) => {
      const failure = new Error("nope");
      failure.name = name;
      share.mockRejectedValue(failure);

      const result = await saveStringAsFile("x", "x.csv", "text/csv");

      expect(result).toBe("downloaded");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("відмова без Error (рядок) теж веде у завантаження", async () => {
    share.mockRejectedValue("boom");
    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("canShare не схвалив файл — завантаження, share не викликається", async () => {
    canShare.mockReturnValue(false);

    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("canShare кидає — завантаження, а не падіння експорту", async () => {
    canShare.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
  });

  it("немає canShare або share (старий WebKit) — завантаження", async () => {
    vi.stubGlobal("navigator", { share, userAgent: "" });
    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");

    vi.stubGlobal("navigator", { canShare, userAgent: "" });
    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");

    expect(share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("поза iOS standalone-PWA (вкладка Safari, десктоп, Android) — лише завантаження", async () => {
    platform.iosStandalone = false;

    expect(await saveStringAsFile("x", "x.csv", "text/csv")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(canShare).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("exportToCSV іде тим самим шляхом і віддає text/csv з імʼям файла", async () => {
    const result = await exportToCSV(rows, columns, "report.csv");

    expect(result).toBe("shared");
    const file = (share.mock.calls[0]![0] as { files: File[] }).files[0]!;
    expect(file.name).toBe("report.csv");
    expect(file.type).toBe("text/csv");
    expect(await readText(file)).toContain("ID,Назва,Сума,Тег");
  });

  it("exportToCSV: скасування аркуша доходить до викликача як cancelled", async () => {
    share.mockRejectedValue(new DOMException("canceled", "AbortError"));
    expect(await exportToCSV(rows, columns, "report.csv")).toBe("cancelled");
  });
});
