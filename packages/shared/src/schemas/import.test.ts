import { describe, it, expect } from "vitest";
import {
  ImportBatchSchema,
  ImportBatchUndoResponseSchema,
  ImportColumnMappingSchema,
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportScreenshotAnalyzeRequestSchema,
  ImportScreenshotDraftSchema,
  ImportStatementPreviewRequestSchema,
  ImportStatementPreviewResponseSchema,
} from "./import";

function validScreenshotRow(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-01-15",
    time: "14:32",
    amountKopiykas: 15000,
    direction: "expense",
    description: "Сільпо",
    confidence: 0.9,
    ...overrides,
  };
}

describe("ImportScreenshotAnalyzeRequestSchema", () => {
  it("приймає image_base64 + mime_type (дзеркало ReceiptAnalyzeRequestSchema)", () => {
    const r = ImportScreenshotAnalyzeRequestSchema.safeParse({
      image_base64: "a".repeat(200),
      mime_type: "image/jpeg",
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє закоротке зображення", () => {
    const r = ImportScreenshotAnalyzeRequestSchema.safeParse({
      image_base64: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("відхиляє зайве поле (strict)", () => {
    const r = ImportScreenshotAnalyzeRequestSchema.safeParse({
      image_base64: "a".repeat(200),
      extra: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportScreenshotDraftSchema", () => {
  it("приймає bank_screenshot draft з рядками", () => {
    const r = ImportScreenshotDraftSchema.safeParse({
      docType: "bank_screenshot",
      bank: "monobank",
      rows: [validScreenshotRow()],
    });
    expect(r.success).toBe(true);
  });

  it("приймає doc_type='receipt'/'other' з порожніми rows (не помилка)", () => {
    for (const docType of ["receipt", "other"]) {
      const r = ImportScreenshotDraftSchema.safeParse({
        docType,
        bank: null,
        rows: [],
      });
      expect(r.success).toBe(true);
    }
  });

  it("відхиляє amountKopiykas <= 0 (напрям — окреме поле, не знак)", () => {
    const r = ImportScreenshotDraftSchema.safeParse({
      docType: "bank_screenshot",
      bank: null,
      rows: [validScreenshotRow({ amountKopiykas: -100 })],
    });
    expect(r.success).toBe(false);
  });

  it("відхиляє time поза HH:MM 24h", () => {
    const r = ImportScreenshotDraftSchema.safeParse({
      docType: "bank_screenshot",
      bank: null,
      rows: [validScreenshotRow({ time: "25:99" })],
    });
    expect(r.success).toBe(false);
  });

  it("приймає time: null", () => {
    const r = ImportScreenshotDraftSchema.safeParse({
      docType: "bank_screenshot",
      bank: null,
      rows: [validScreenshotRow({ time: null })],
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє невідомий docType", () => {
    const r = ImportScreenshotDraftSchema.safeParse({
      docType: "invoice",
      bank: null,
      rows: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportColumnMappingSchema", () => {
  it("приймає мінімальний mapping (лише 3 обовʼязкові колонки)", () => {
    const r = ImportColumnMappingSchema.safeParse({
      dateCol: "Дата",
      amountCol: "Сума",
      descriptionCol: "Опис",
    });
    expect(r.success).toBe(true);
  });

  it("приймає dateFormat + decimalComma", () => {
    const r = ImportColumnMappingSchema.safeParse({
      dateCol: "Дата",
      amountCol: "Сума",
      descriptionCol: "Опис",
      dateFormat: "DD.MM.YYYY",
      decimalComma: true,
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє невідомий dateFormat", () => {
    const r = ImportColumnMappingSchema.safeParse({
      dateCol: "Дата",
      amountCol: "Сума",
      descriptionCol: "Опис",
      dateFormat: "MM/DD/YYYY",
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportStatementPreviewRequestSchema", () => {
  it("приймає csv_text без mapping", () => {
    const r = ImportStatementPreviewRequestSchema.safeParse({
      csv_text: "date,amount,description\n2026-01-15,-100.00,Test\n",
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє порожній csv_text", () => {
    const r = ImportStatementPreviewRequestSchema.safeParse({ csv_text: "" });
    expect(r.success).toBe(false);
  });

  it("відхиляє csv_text > 5MB за БАЙТАМИ (кириличний текст, 2 байти/символ)", () => {
    // 2 700 000 кириличних символів × 2 байти = ~5.15MB > 5 * 1024 * 1024,
    // хоча довжина РЯДКА (символів) сама по собі менша за наївний
    // char-count-ліміт 5_000_000 — саме той кейс, який TextEncoder-перевірка
    // ловить, а .max() на довжині рядка пропустив би.
    const bigCyrillic = "ю".repeat(2_700_000);
    const r = ImportStatementPreviewRequestSchema.safeParse({
      csv_text: bigCyrillic,
    });
    expect(r.success).toBe(false);
  });

  it("відхиляє зайве поле (strict)", () => {
    const r = ImportStatementPreviewRequestSchema.safeParse({
      csv_text: "a,b,c",
      extra: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportStatementPreviewResponseSchema", () => {
  it("приймає needsMapping-гілку (headers + sampleRows, rows/skipped порожні)", () => {
    const r = ImportStatementPreviewResponseSchema.safeParse({
      profile: null,
      needsMapping: true,
      headers: ["Дата", "Сума", "Опис"],
      sampleRows: [["2026-01-15", "-100.00", "Test"]],
      rows: [],
      skipped: [],
    });
    expect(r.success).toBe(true);
  });

  it("приймає autoprofile-гілку (mono) без headers/sampleRows", () => {
    const r = ImportStatementPreviewResponseSchema.safeParse({
      profile: "mono",
      needsMapping: false,
      rows: [
        {
          date: "2026-01-15",
          amountKopiykas: 10000,
          direction: "expense",
          description: "Сільпо",
        },
      ],
      skipped: [{ line: 3, reason: "not_uah" }],
    });
    expect(r.success).toBe(true);
  });

  it("приймає profile: 'custom'", () => {
    const r = ImportStatementPreviewResponseSchema.safeParse({
      profile: "custom",
      needsMapping: false,
      rows: [],
      skipped: [{ line: 2, reason: "unparsed_date" }],
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє невідомий skip reason", () => {
    const r = ImportStatementPreviewResponseSchema.safeParse({
      profile: "mono",
      needsMapping: false,
      rows: [],
      skipped: [{ line: 2, reason: "wrong_bank" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportCommitRequestSchema", () => {
  function validCommitBody(overrides: Record<string, unknown> = {}) {
    return {
      source: "bank_statement",
      rows: [
        {
          date: "2026-01-15",
          amountKopiykas: 10000,
          direction: "expense",
          description: "Сільпо",
          category: "food",
        },
      ],
      ...overrides,
    };
  }

  it("приймає валідний commit body", () => {
    expect(ImportCommitRequestSchema.safeParse(validCommitBody()).success).toBe(
      true,
    );
  });

  it("відхиляє порожній rows[]", () => {
    const r = ImportCommitRequestSchema.safeParse(
      validCommitBody({ rows: [] }),
    );
    expect(r.success).toBe(false);
  });

  it("відхиляє рядок без category", () => {
    const body = validCommitBody();
    const rows = body.rows as Array<Record<string, unknown>>;
    delete rows[0]!["category"];
    expect(ImportCommitRequestSchema.safeParse(body).success).toBe(false);
  });

  it("відхиляє невідоме source", () => {
    const r = ImportCommitRequestSchema.safeParse(
      validCommitBody({ source: "receipt_batch" }),
    );
    expect(r.success).toBe(false);
  });

  it("відхиляє amountKopiykas <= 0", () => {
    const body = validCommitBody();
    const rows = body.rows as Array<Record<string, unknown>>;
    rows[0]!["amountKopiykas"] = 0;
    expect(ImportCommitRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("ImportCommitResponseSchema", () => {
  it("приймає canonical response shape", () => {
    const r = ImportCommitResponseSchema.safeParse({
      batchId: 1,
      created: 3,
      linked: 0,
      skipped: { monoMatched: 1, duplicate: 2 },
    });
    expect(r.success).toBe(true);
  });
});

describe("ImportBatchSchema / undo response", () => {
  function validBatch(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      source: "bank_statement",
      status: "completed",
      rowsTotal: 3,
      rowsCreated: 2,
      rowsLinked: 0,
      rowsSkipped: 1,
      createdRowIds: ["imp1:abc", "imp1:def"],
      createdAt: "2026-01-15T12:35:00.000Z",
      updatedAt: "2026-01-15T12:35:00.000Z",
      ...overrides,
    };
  }

  it("приймає completed batch", () => {
    expect(ImportBatchSchema.safeParse(validBatch()).success).toBe(true);
  });

  it("приймає undone batch", () => {
    expect(
      ImportBatchSchema.safeParse(validBatch({ status: "undone" })).success,
    ).toBe(true);
  });

  it("відхиляє невідомий status", () => {
    expect(
      ImportBatchSchema.safeParse(validBatch({ status: "pending" })).success,
    ).toBe(false);
  });

  it("ImportBatchUndoResponseSchema приймає batch + tombstoned:0 (ідемпотентний no-op)", () => {
    const r = ImportBatchUndoResponseSchema.safeParse({
      batch: validBatch({ status: "undone" }),
      tombstoned: 0,
    });
    expect(r.success).toBe(true);
  });
});
