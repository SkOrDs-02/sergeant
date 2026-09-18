import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// «Сітка 2» дедуп-превʼю ходить у БД одним GROUP BY-запитом
// (duplicateDetect.ts) — дефолт «збігів немає», окремий тест підкладає
// наявні витрати.
const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../db.js", () => ({ default: { query: dbMocks.query } }));

import statementPreviewHandler from "./statementPreview.js";
import { makeXlsx } from "@sergeant/tabular-import/__fixtures__/makeXlsx";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(body: unknown): Request {
  // `user` — router-рівнева auth (той самий контракт, що commit.ts).
  return { user: { id: "u1" }, body } as unknown as Request;
}

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.query.mockResolvedValue({ rows: [] });
});

// Mono-заголовки звірені з реальною випискою (live-прогін 2026-08-18:
// 255/255 рядків, 0 skip, валютні операції в UAH-еквіваленті пройшли) —
// сама виписка НЕ комітиться (реальні фінансові дані), фікстура нижче
// синтетична. Privat24-заголовки досі власне припущення модуля (реальної
// фікстури нема, див. csvProfiles.ts).
const MONO_CSV = [
  "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Курс обміну,Сума комісій (UAH),Сума кешбеку (UAH),Залишок після операції",
  "15.01.2026 14:32:10,Сільпо,5411,-847.50,-847.50,UAH,1,0.00,8.47,5000.00",
  "16.01.2026 09:00:00,Зарплата,,15000.00,15000.00,UAH,1,0.00,0.00,20000.00",
  "17.01.2026 10:00:00,Баланс не транзакція,,,,,,,,", // зламаний/порожній рядок — жодної суми
].join("\n");

const PRIVAT24_CSV = [
  "Дата;Категорія;Картка;Опис операції;Сума в валюті рахунку;Валюта рахунку;Сума в валюті операції;Валюта операції;Залишок на рахунку",
  "15.01.2026;Продукти;1234;АТБ;-500,00;UAH;-500,00;UAH;10000,00",
  "16.01.2026;Перекази;1234;Поповнення в USD;100,00;USD;100,00;USD;10100,00",
].join("\n");

describe("statementPreviewHandler — mono autoprofile", () => {
  it("детектить mono, парсить рядки, direction за знаком amount-колонки", async () => {
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: MONO_CSV }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      profile: string;
      needsMapping: boolean;
      rows: Array<{
        date: string;
        amountKopiykas: number;
        direction: string;
        description: string;
      }>;
      skipped: Array<{ line: number; reason: string }>;
    };
    expect(body.profile).toBe("mono");
    expect(body.needsMapping).toBe(false);
    expect(body.rows).toEqual([
      {
        date: "2026-01-15",
        amountKopiykas: 84750,
        direction: "expense",
        description: "Сільпо",
        categoryHint: "food",
      },
      {
        date: "2026-01-16",
        amountKopiykas: 1500000,
        direction: "income",
        description: "Зарплата",
        categoryHint: "salary",
      },
    ]);
    // Рядок 4 несе непорожній опис ("Баланс не транзакція") і валідну
    // дату — лише amount-колонка порожня, тож reason точковий
    // (`unparsed_amount`), не загальний `empty`.
    expect(body.skipped).toEqual([{ line: 4, reason: "unparsed_amount" }]);
  });

  it("маркує перекази на власну банку transferLikely (формулювання реальної виписки)", async () => {
    const csv = [
      "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Курс обміну,Сума комісій (UAH),Сума кешбеку (UAH),Залишок після операції",
      "12.08.2026 10:00:00,Поповнення «просто»,4829,-5000.00,-5000.00,UAH,1,0.00,0.00,1000.00",
      "13.08.2026 11:00:00,Часткове зняття банки «просто»,4829,350.00,350.00,UAH,1,0.00,0.00,1350.00",
      "13.08.2026 12:00:00,Поповнення «На допомогу Єнчику» вiд Віктор К.,4829,-95.72,-95.72,UAH,1,0.00,0.00,1254.28",
      "14.08.2026 09:00:00,АТБ-Маркет,5411,-120.00,-120.00,UAH,1,0.00,0.00,1134.28",
    ].join("\n");
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: csv }), res);

    const body = res.body as {
      rows: Array<{ description: string; transferLikely?: boolean }>;
    };
    expect(
      body.rows.map((r) => [r.description, r.transferLikely ?? false]),
    ).toEqual([
      ["Поповнення «просто»", true],
      ["Часткове зняття банки «просто»", true],
      // Донат у чужу банку (« вiд ») — реальна витрата, НЕ переказ.
      ["Поповнення «На допомогу Єнчику» вiд Віктор К.", false],
      ["АТБ-Маркет", false],
    ]);
  });
});

describe("statementPreviewHandler — privat24 autoprofile", () => {
  it("детектить privat24, comma-decimal суми, not_uah skip для чужої валюти рахунку", async () => {
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: PRIVAT24_CSV }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      profile: string;
      rows: Array<{ amountKopiykas: number; direction: string }>;
      skipped: Array<{ line: number; reason: string }>;
    };
    expect(body.profile).toBe("privat24");
    expect(body.rows).toEqual([
      {
        date: "2026-01-15",
        amountKopiykas: 50000,
        direction: "expense",
        description: "АТБ",
        categoryHint: "food",
      },
    ]);
    // Другий рядок — USD-рахунок ("Валюта рахунку" != UAH) → not_uah.
    expect(body.skipped).toEqual([{ line: 3, reason: "not_uah" }]);
  });
});

describe("statementPreviewHandler — невідомий формат", () => {
  it("без mapping → needsMapping:true + headers + sampleRows", async () => {
    const csv = [
      "Custom Date,Custom Amount,Custom Note",
      "2026-01-15,-100.00,Test",
    ].join("\n");
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: csv }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      profile: string | null;
      needsMapping: boolean;
      headers: string[];
      sampleRows: string[][];
      rows: unknown[];
      skipped: unknown[];
    };
    expect(body.profile).toBeNull();
    expect(body.needsMapping).toBe(true);
    expect(body.headers).toEqual([
      "Custom Date",
      "Custom Amount",
      "Custom Note",
    ]);
    expect(body.sampleRows).toEqual([["2026-01-15", "-100.00", "Test"]]);
    expect(body.rows).toEqual([]);
    expect(body.skipped).toEqual([]);
  });

  it("з mapping → profile:'custom', парсить по заданих колонках", async () => {
    const csv = [
      "Custom Date,Custom Amount,Custom Note",
      "2026-01-15,-100.00,Кава",
      "16.01.2026,50.25,Повернення",
    ].join("\n");
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({
        csv_text: csv,
        mapping: {
          dateCol: "Custom Date",
          amountCol: "Custom Amount",
          descriptionCol: "Custom Note",
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      profile: string;
      rows: Array<{ date: string; amountKopiykas: number; direction: string }>;
    };
    expect(body.profile).toBe("custom");
    // Без явного mapping.dateFormat — автодетект per-рядок: перший рядок
    // ISO (`-`-роздільник), другий DD.MM.YYYY (`.`-роздільник); обидва
    // мають розпізнатись НЕЗАЛЕЖНО один від одного (regression-тест на
    // знахідку: хардкоджений дефолт "DD.MM.YYYY" раніше глушив ISO-рядки).
    expect(body.rows[0]).toEqual({
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
      description: "Кава",
    });
    expect(body.rows[1]).toEqual({
      date: "2026-01-16",
      amountKopiykas: 5025,
      direction: "income",
      description: "Повернення",
      categoryHint: "refund",
    });
  });

  it("mapping, що не резолвиться на фактичні headers → needsMapping fallback", async () => {
    const csv = ["A,B,C", "1,2,3"].join("\n");
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({
        csv_text: csv,
        mapping: {
          dateCol: "Not A Real Column",
          amountCol: "B",
          descriptionCol: "C",
        },
      }),
      res,
    );

    const body = res.body as { needsMapping: boolean; profile: string | null };
    expect(body.needsMapping).toBe(true);
    expect(body.profile).toBeNull();
  });
});

describe("statementPreviewHandler — зламані рядки", () => {
  it("unparsed_date і unparsed_amount отримують правильні reason-и", async () => {
    const csv = [
      "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Курс обміну,Сума комісій (UAH),Сума кешбеку (UAH),Залишок після операції",
      "не дата,Тест,,-100.00,,,,,,",
      "15.01.2026,Тест 2,,не число,,,,,,",
    ].join("\n");
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: csv }), res);

    const body = res.body as {
      skipped: Array<{ line: number; reason: string }>;
    };
    expect(body.skipped).toEqual([
      { line: 2, reason: "unparsed_date" },
      { line: 3, reason: "unparsed_amount" },
    ]);
  });

  it("`;`-роздільник детектиться навіть для custom mapping виписки", async () => {
    const csv = ["Date;Amount;Note", "2026-01-15;-10.00;X"].join("\n");
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({
        csv_text: csv,
        mapping: {
          dateCol: "Date",
          amountCol: "Amount",
          descriptionCol: "Note",
        },
      }),
      res,
    );
    const body = res.body as { rows: Array<{ amountKopiykas: number }> };
    expect(body.rows[0]?.amountKopiykas).toBe(1000);
  });
});

describe("statementPreviewHandler — «сітка 2» дедуп-превʼю (duplicateLikely)", () => {
  it("рядок зі збігом дата+сума+напрям серед збережених витрат отримує duplicateLikely", async () => {
    // Наявна витрата: Сільпо 15.01 на 847.50 грн (blob зберігає ГРИВНІ й
    // kind — duplicateDetect.ts конвертує в копійки/напрям сам).
    dbMocks.query.mockResolvedValue({
      rows: [
        { date: "2026-01-15", amount: "847.5", kind: "expense", count: "1" },
      ],
    });
    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: MONO_CSV }), res);

    const body = res.body as {
      rows: Array<{ description: string; duplicateLikely?: boolean }>;
    };
    expect(body.rows[0]?.description).toBe("Сільпо");
    expect(body.rows[0]?.duplicateLikely).toBe(true);
    // Зарплата (income, інший бакет) — без мітки: поле взагалі відсутнє.
    expect(body.rows[1]?.duplicateLikely).toBeUndefined();
    // Один GROUP BY-запит на весь превʼю, з user-скоупом.
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
    expect(dbMocks.query.mock.calls[0]?.[1]?.[0]).toBe("u1");
  });
});

// ─────────────── Файлова гілка контракту (`file_base64`) ────────────────
// Спека Фази 2 приймала лише `csv_text`, і Privat24 — банк, який віддає
// виписку таблицею, — не імпортувався взагалі. Тести нижче ганяють ту саму
// сітку через реальний XLSX-байтстрім, а не через текстову підміну.

describe("statement/preview — файл замість тексту", () => {
  /** 2026-08-16 у serial-нумерації Excel (епоха 1899-12-30). */
  const SERIAL_2026_08_16 = 46250;

  const privat24Xlsx = makeXlsx({
    sharedStrings: [
      "Виписка з рахунку за період 01.08.2026 — 25.08.2026",
      "Дата",
      "Опис операції",
      "Сума в валюті рахунку",
      "Валюта рахунку",
      "АТБ-Маркет",
      "UAH",
      "Зарплата",
      "Оплата в Booking.com",
      "EUR",
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
      [
        { kind: "date", serial: SERIAL_2026_08_16 + 2 },
        { kind: "shared", index: 8 },
        { kind: "number", value: -50 },
        { kind: "shared", index: 9 },
      ],
    ],
  });

  it("XLSX-виписка Privat24 підхоплює автопрофіль і канонічні значення", async () => {
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({ file_base64: privat24Xlsx.toString("base64") }),
      res,
    );

    const body = res.body as {
      profile: string;
      needsMapping: boolean;
      rows: Array<{ date: string; amountKopiykas: number; direction: string }>;
      skipped: Array<{ line: number; reason: string }>;
    };
    expect(body.profile).toBe("privat24");
    expect(body.needsMapping).toBe(false);
    // Дата з типізованої клітинки і сума з крапкою НЕ мусять постраждати
    // від друкованих підказок профілю (`DD.MM.YYYY` + кома-десятковий):
    // саме на цьому XLSX-шлях мовчки давав би `unparsed_date` і суму,
    // помножену на 100.
    expect(body.rows).toEqual([
      {
        date: "2026-08-16",
        amountKopiykas: 12345,
        direction: "expense",
        description: "АТБ-Маркет",
        categoryHint: "food",
      },
      {
        date: "2026-08-17",
        amountKopiykas: 2_000_000,
        direction: "income",
        description: "Зарплата",
        categoryHint: "salary",
      },
    ]);
    // EUR-рядок відсіює currency-колонка профілю; номер рядка — фізичний
    // у файлі (преамбула врахована), а не позиція в зрізі даних.
    expect(body.skipped).toEqual([{ line: 6, reason: "not_uah" }]);
  });

  it("невідомий XLSX без збігу заголовків веде в ручний column-mapper", async () => {
    const unknownXlsx = makeXlsx({
      sharedStrings: ["When", "What", "How much", "Coffee"],
      rows: [
        [
          { kind: "shared", index: 0 },
          { kind: "shared", index: 1 },
          { kind: "shared", index: 2 },
        ],
        [
          { kind: "date", serial: SERIAL_2026_08_16 },
          { kind: "shared", index: 3 },
          { kind: "number", value: -75.5 },
        ],
      ],
    });
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({ file_base64: unknownXlsx.toString("base64") }),
      res,
    );
    const body = res.body as { needsMapping: boolean; headers: string[] };
    expect(body.needsMapping).toBe(true);
    expect(body.headers).toEqual(["When", "What", "How much"]);
  });

  it("mapping користувача на XLSX читає канонічні дату й суму", async () => {
    const unknownXlsx = makeXlsx({
      sharedStrings: ["When", "What", "How much", "Coffee"],
      rows: [
        [
          { kind: "shared", index: 0 },
          { kind: "shared", index: 1 },
          { kind: "shared", index: 2 },
        ],
        [
          { kind: "date", serial: SERIAL_2026_08_16 },
          { kind: "shared", index: 3 },
          { kind: "number", value: -75.5 },
        ],
      ],
    });
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({
        file_base64: unknownXlsx.toString("base64"),
        mapping: {
          dateCol: "When",
          amountCol: "How much",
          descriptionCol: "What",
        },
      }),
      res,
    );
    const body = res.body as {
      profile: string;
      rows: Array<{ date: string; amountKopiykas: number }>;
    };
    expect(body.profile).toBe("custom");
    expect(body.rows).toEqual([
      {
        date: "2026-08-16",
        amountKopiykas: 7550,
        direction: "expense",
        description: "Coffee",
      },
    ]);
  });

  it("PDF відхиляється зрозумілою відмовою, а не порожнім результатом", async () => {
    const res = makeRes();
    await expect(
      statementPreviewHandler(
        makeReq({
          file_base64: Buffer.from("%PDF-1.4\n%bin", "latin1").toString(
            "base64",
          ),
        }),
        res,
      ),
    ).rejects.toThrow(/PDF/);
  });
});

// ───────────── Privat24: справжні заголовки живого експорту ─────────────
// Заголовки нижче ДОСЛІВНО з реального XLSX «Історія операцій за період»
// (мобільний Privat24, 2026-08-25) — на ньому й виявилось, що попередній
// профіль вгадував колонки неправильно («сума в валюті рахунку» замість
// «картки»). Рядки даних синтетичні: репо публічне, реальна фінансова
// топологія в нього не комітиться (той самий підхід, що з mono вище).

describe("statement/preview — Privat24 за реальними заголовками", () => {
  const SERIAL = 46250; // 2026-08-16
  const HEADERS = [
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

  const realShapeXlsx = makeXlsx({
    sharedStrings: [
      "Історія операцій за період 25.07.2026 - 25.08.2026",
      ...HEADERS,
      "Супермаркети та продукти",
      "5168 **** **** 1898",
      "Сільпо",
      "UAH",
      "Цифрові товари",
      "Apple",
      "USD",
      "Зарахування переказу",
      "від DMYTRO STAKHOV",
      "Зарахування зі своєї картки",
      "Зі своєї картки *1524",
    ],
    rows: [
      [{ kind: "shared", index: 0 }],
      HEADERS.map((_, i) => ({ kind: "shared", index: i + 1 }) as const),
      [
        { kind: "date", serial: SERIAL },
        { kind: "shared", index: 11 },
        { kind: "shared", index: 12 },
        { kind: "shared", index: 13 },
        { kind: "number", value: -747.84 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 747.84 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 15362.05 },
        { kind: "shared", index: 14 },
      ],
      // Покупка в USD ГРИВНЕВОЮ карткою: «Валюта транзакції» = USD, але
      // «Валюта картки» = UAH. Фільтр по валюті транзакції викинув би цей
      // рядок як `not_uah` — саме тому профіль дивиться на картку.
      [
        { kind: "date", serial: SERIAL + 1 },
        { kind: "shared", index: 15 },
        { kind: "shared", index: 12 },
        { kind: "shared", index: 16 },
        { kind: "number", value: -1366.82 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 30.48 },
        { kind: "shared", index: 17 },
        { kind: "number", value: 20322.8 },
        { kind: "shared", index: 14 },
      ],
      // Дохід: «Сума в валюті картки» несе знак, «в валюті транзакції» —
      // модуль, тож напрям відновлюється лише з першої.
      [
        { kind: "date", serial: SERIAL + 2 },
        { kind: "shared", index: 18 },
        { kind: "shared", index: 12 },
        { kind: "shared", index: 19 },
        { kind: "number", value: 20000 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 20000 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 21689.62 },
        { kind: "shared", index: 14 },
      ],
      // Переказ між ВЛАСНИМИ картками: опис слова «переказ» не містить.
      [
        { kind: "date", serial: SERIAL + 3 },
        { kind: "shared", index: 20 },
        { kind: "shared", index: 12 },
        { kind: "shared", index: 21 },
        { kind: "number", value: 6508 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 6508 },
        { kind: "shared", index: 14 },
        { kind: "number", value: 6518.08 },
        { kind: "shared", index: 14 },
      ],
    ],
  });

  it("впізнає профіль і читає всі рядки без пропусків", async () => {
    const res = makeRes();
    await statementPreviewHandler(
      makeReq({ file_base64: realShapeXlsx.toString("base64") }),
      res,
    );

    const body = res.body as {
      profile: string;
      needsMapping: boolean;
      rows: Array<{
        date: string;
        amountKopiykas: number;
        direction: string;
        description: string;
        transferLikely?: boolean;
      }>;
      skipped: unknown[];
    };

    expect(body.profile).toBe("privat24");
    expect(body.needsMapping).toBe(false);
    expect(body.skipped).toEqual([]);
    expect(body.rows).toEqual([
      {
        date: "2026-08-16",
        amountKopiykas: 74784,
        direction: "expense",
        description: "Сільпо",
        // Категорія з ВЛАСНОЇ колонки банку («Супермаркети та продукти»)
        // — найнадійніший шар `categoryHint.ts`.
        categoryHint: "food",
      },
      {
        date: "2026-08-17",
        amountKopiykas: 136682,
        direction: "expense",
        description: "Apple",
        categoryHint: "subscriptions",
      },
      {
        date: "2026-08-18",
        amountKopiykas: 2_000_000,
        direction: "income",
        description: "від DMYTRO STAKHOV",
        // «Зарахування переказу» осмисленого чипа доходу не має —
        // сервер мовчить, клієнт лишає свій дефолт.
      },
      {
        date: "2026-08-19",
        amountKopiykas: 650_800,
        direction: "income",
        description: "Зі своєї картки *1524",
        // Гроші не покидали кишеню — рядок лишається видимим, але без
        // галочки за замовчуванням.
        transferLikely: true,
      },
    ]);
  });
});

describe("statement/preview — категорія без колонки категорії", () => {
  it("бере підказку з MCC (mono) і з опису мерчанта", async () => {
    // mono власної категорії не друкує, зате друкує МСС; а для рядка без
    // придатного МСС лишається третій шар — ключові слова опису.
    const csv = [
      "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції",
      "15.01.2026 14:32:10,Невідомий мерчант,5411,-100.00,-100.00,UAH",
      "15.01.2026 15:00:00,McDonald’s,0,-200.00,-200.00,UAH",
      "15.01.2026 16:00:00,FLAMPIC,0,-300.00,-300.00,UAH",
    ].join("\n");

    const res = makeRes();
    await statementPreviewHandler(makeReq({ csv_text: csv }), res);

    const body = res.body as {
      profile: string;
      rows: Array<{ description: string; categoryHint?: string }>;
    };
    expect(body.profile).toBe("mono");
    expect(body.rows.map((r) => r.categoryHint)).toEqual([
      "food", // з МСС 5411, попри нерозпізнаваний опис
      "cafe", // МСС нульовий → ключове слово опису
      undefined, // жоден шар не спрацював — клієнт лишає дефолт
    ]);
  });
});
