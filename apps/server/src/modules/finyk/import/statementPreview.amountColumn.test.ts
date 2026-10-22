import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// Той самий каркас, що в statementPreview.test.ts: БД замокана, дублікатів немає.
const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../db.js", () => ({ default: { query: dbMocks.query } }));

import statementPreviewHandler from "./statementPreview.js";

interface PreviewBody {
  profile: string;
  rows: Array<{ amountKopiykas: number; direction: string }>;
  skipped: Array<{ line: number; reason: string }>;
}

async function preview(body: unknown): Promise<PreviewBody> {
  let out: unknown;
  const res = {
    status() {
      return this;
    },
    json(p: unknown) {
      out = p;
      return this;
    },
  } as unknown as Response;
  await statementPreviewHandler(
    { user: { id: "u1" }, body } as unknown as Request,
    res,
  );
  return out as PreviewBody;
}

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.query.mockResolvedValue({ rows: [] });
});

const MAPPING = {
  dateCol: "When",
  amountCol: "Sum",
  descriptionCol: "What",
};

function csv(amounts: string[]): string {
  return [
    "When;What;Sum",
    ...amounts.map((a, i) => `0${i + 1}.08.2026;Shop ${i};${a}`),
  ].join("\n");
}

describe("statementPreview: роздільник по колонці (data-31)", () => {
  it("колонка з копійками (кома): «1,234» не імпортується мовчки, решта ок", async () => {
    // Дефолт ColumnMapper decimalComma:true: раніше «1,234» ставало 1,23 ₴.
    const body = await preview({
      csv_text: csv(["-12,50", "-1,234", "-1 234,56", "-7"]),
      mapping: { ...MAPPING, decimalComma: true },
    });
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([1250, 123456, 700]);
    expect(body.skipped).toEqual([{ line: 3, reason: "unparsed_amount" }]);
  });

  it("колонка з копійками (крапка) і комою тисяч: «1,234.56» не псується хибною підказкою", async () => {
    const body = await preview({
      csv_text: csv(["-12.50", "-1,234.56", "-2,500.00", "-1,234"]),
      mapping: { ...MAPPING, decimalComma: true },
    });
    // «-1,234» у колонці з крапкою-десятковою: кома тисячна ⇒ 1234 грн.
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([
      1250, 123456, 250000, 123400,
    ]);
    expect(body.skipped).toEqual([]);
  });

  it("колонка без копійок: «1,234» без явної підказки відхиляється, «1234» ні", async () => {
    const body = await preview({
      csv_text: csv(["-1234", "-1,234", "-500"]),
      mapping: MAPPING,
    });
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([123400, 50000]);
    expect(body.skipped).toEqual([{ line: 3, reason: "unparsed_amount" }]);
  });

  it("колонка без копійок: свідомий decimalComma:false читає «1,234» як 1234 грн", async () => {
    const body = await preview({
      csv_text: csv(["-1234", "-1,234", "-500"]),
      mapping: { ...MAPPING, decimalComma: false },
    });
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([
      123400, 123400, 50000,
    ]);
    expect(body.skipped).toEqual([]);
  });

  it("англомовна колонка «1,234,567.00» не стає в 1000 разів меншою", async () => {
    const body = await preview({
      csv_text: csv(["-1,234,567.00", "-1,234"]),
      mapping: MAPPING,
    });
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([123456700, 123400]);
    expect(body.skipped).toEqual([]);
  });

  it("mixed-колонка (кома й крапка копійок): неоднозначне відхиляється", async () => {
    const body = await preview({
      csv_text: csv(["-12,50", "-12.50", "-1,234"]),
      mapping: MAPPING,
    });
    expect(body.rows.map((r) => r.amountKopiykas)).toEqual([1250, 1250]);
    expect(body.skipped).toEqual([{ line: 4, reason: "unparsed_amount" }]);
  });

  it("колонки дебет/кредит ділять один висновок про роздільник", async () => {
    const text = [
      "When;What;Debit;Credit",
      "01.08.2026;A;1,234;",
      "02.08.2026;B;;12,50",
    ].join("\n");
    const body = await preview({
      csv_text: text,
      mapping: { ...MAPPING, amountCol: "Debit", creditCol: "Credit" },
    });
    expect(body.rows).toEqual([
      expect.objectContaining({ amountKopiykas: 1250, direction: "income" }),
    ]);
    expect(body.skipped).toEqual([{ line: 2, reason: "unparsed_amount" }]);
  });
});
