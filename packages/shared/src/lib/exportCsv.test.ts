/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * AI-CONTEXT: CSV легко зробити «майже правильним» — файл відкриється, дані
 * буде видно, і жоден тип не заперечить. Тому асерти нижче цілять у тихі
 * провали: кракозябри в Excel, зʼїдені колонки, зламані клітинки з комою в
 * описі транзакції.
 */
import { describe, expect, it } from "vitest";

import {
  CSV_BOM,
  buildExportCsv,
  collectColumns,
  escapeCsvValue,
} from "./exportCsv";

describe("escapeCsvValue", () => {
  it("порожні значення дають порожню клітинку, а не «null»", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue("")).toBe("");
  });

  it("кома, лапки й перенос рядка змушують обгортати", () => {
    // Опис транзакції «Сільпо, вул. Хрещатик» — цілком типовий. Без
    // обгортання він розповзеться на дві колонки і зсуне весь рядок.
    expect(escapeCsvValue("Сільпо, вул. Хрещатик")).toBe(
      '"Сільпо, вул. Хрещатик"',
    );
    expect(escapeCsvValue('каже "так"')).toBe('"каже ""так"""');
    expect(escapeCsvValue("рядок\nдругий")).toBe('"рядок\nдругий"');
  });

  it("звичайний текст НЕ обгортається — файл має читатись оком", () => {
    expect(escapeCsvValue("Продукти")).toBe("Продукти");
    expect(escapeCsvValue(1234)).toBe("1234");
  });

  it("нуль і false не зникають", () => {
    // Пастка `if (!value) return ""`: нуль гривень і `false` — валідні
    // значення, і порожня клітинка замість них бреше про дані.
    expect(escapeCsvValue(0)).toBe("0");
    expect(escapeCsvValue(false)).toBe("false");
  });

  it("знешкоджує formula injection", () => {
    // Excel виконує клітинку, що починається з = + - @, як формулу.
    // Опис «=1+1» або борг «-Іван» — реальні дані, а не екзотика.
    expect(escapeCsvValue("=1+1")).toBe("'=1+1");
    expect(escapeCsvValue("-Іван")).toBe("'-Іван");
    expect(escapeCsvValue("@user")).toBe("'@user");
    // Відʼємне ЧИСЛО при цьому лишається числом — інакше зіпсували б
    // кожну витрату у файлі.
    expect(escapeCsvValue(-500)).toBe("'-500");
  });

  it("вкладені структури згортаються в JSON, а не в [object Object]", () => {
    expect(escapeCsvValue({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe("collectColumns", () => {
  it("бере ОБʼЄДНАННЯ ключів усіх рядків, не лише першого", () => {
    // Найтихіший баг цього файлу: колонки з першого рядка. Необовʼязкове
    // поле, відсутнє в першому записі, зникло б з експорту повністю — і
    // помітити це можна тільки звіривши з JSON вручну.
    expect(
      collectColumns([{ id: 1 }, { id: 2, comment: "x" }, { note: "y" }]),
    ).toEqual(["id", "comment", "note"]);
  });

  it("порожній вхід → порожні колонки", () => {
    expect(collectColumns([])).toEqual([]);
  });
});

describe("buildExportCsv", () => {
  it("НЕ додає BOM — його вже клеїть транспорт", () => {
    // Головний асерт файлу, і він навмисно зворотний до інтуїції. BOM для
    // кирилиці в Excel критичний, але `downloadString` уже додає `\uFEFF`
    // до будь-якого файлу. Другий BOM тут дав би видимий сміттєвий символ
    // на початку першої клітинки — тобто «полагодивши» кодування, ми б
    // його ж і зламали.
    const csv = buildExportCsv([
      { name: "транзакції", rows: [{ опис: "Кава" }] },
    ]);
    expect(csv.startsWith(CSV_BOM)).toBe(false);
    expect(csv).toContain("Кава");
  });

  it("кожна секція має заголовок і власні колонки", () => {
    const csv = buildExportCsv([
      { name: "рахунки", rows: [{ id: "a", balance: 100 }] },
      { name: "підписки", rows: [{ plan: "pro" }] },
    ]);
    expect(csv).toContain("# рахунки");
    expect(csv).toContain("id,balance");
    expect(csv).toContain("a,100");
    expect(csv).toContain("# підписки");
    expect(csv).toContain("plan");
  });

  it("порожня секція лишається у файлі з поміткою", () => {
    // «Немає рядка про підписки» і «підписки: порожньо» — різні
    // повідомлення. Мовчазне викидання секції виглядало б як загублені
    // дані саме тоді, коли людина перевіряє повноту експорту.
    const csv = buildExportCsv([{ name: "підписки", rows: [] }]);
    expect(csv).toContain("# підписки");
    expect(csv).toContain("(порожньо)");
  });

  it("рядки з різним набором полів вирівнюються по колонках", () => {
    const csv = buildExportCsv([
      {
        name: "t",
        rows: [{ a: 1, b: 2 }, { a: 3 }, { b: 4 }],
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("a,b");
    expect(lines[2]).toBe("1,2");
    // Пропущене поле — порожня клітинка на СВОЄМУ місці, а не зсув.
    expect(lines[3]).toBe("3,");
    expect(lines[4]).toBe(",4");
  });

  it("порожній список секцій не падає", () => {
    expect(buildExportCsv([])).toBe("\n");
  });
});
