import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import statementPreviewHandler from "./statementPreview.js";

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
  return { body } as unknown as Request;
}

// AI-DANGER: заголовки/рядки нижче — власні припущення модуля (немає
// реальних фікстур mono/Privat24, див. csvProfiles.ts). Перевіряють
// самоузгодженість реалізації, не точність проти живого банку.
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
      },
      {
        date: "2026-01-16",
        amountKopiykas: 1500000,
        direction: "income",
        description: "Зарплата",
      },
    ]);
    // Рядок 4 несе непорожній опис ("Баланс не транзакція") і валідну
    // дату — лише amount-колонка порожня, тож reason точковий
    // (`unparsed_amount`), не загальний `empty`.
    expect(body.skipped).toEqual([{ line: 4, reason: "unparsed_amount" }]);
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
