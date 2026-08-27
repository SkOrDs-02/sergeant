import { describe, it, expect } from "vitest";
import {
  ReceiptAnalyzeRequestSchema,
  ReceiptDraftSchema,
  ReceiptLookupRequestSchema,
  ReceiptSaveRequestSchema,
  ReceiptSchema,
} from "./receipts";

function validDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source: "dps",
    fiscalNum: "4000123456",
    store: "Сільпо",
    storeTaxId: "12345678",
    purchasedAt: "2026-01-15T12:32:10.000Z",
    totalKopiykas: 15000,
    items: [
      {
        position: 1,
        name: "Молоко",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ],
    confidence: null,
    rawPayload: { xml: "<CHECK></CHECK>" },
    ...overrides,
  };
}

describe("ReceiptDraftSchema", () => {
  it("приймає валідну dps-чернетку", () => {
    const r = ReceiptDraftSchema.safeParse(validDraft());
    expect(r.success).toBe(true);
  });

  it("приймає порожню назву магазину (fallback — відповідальність save.ts)", () => {
    const r = ReceiptDraftSchema.safeParse(validDraft({ store: "" }));
    expect(r.success).toBe(true);
  });

  it("приймає fiscalNum: null (vision-чек без QR)", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({ source: "vision", fiscalNum: null, confidence: 0.7 }),
    );
    expect(r.success).toBe(true);
  });

  it("дозволяє вiдʼємну суму позиції (рядок знижки)", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({
        items: [
          {
            position: 2,
            name: "Знижка",
            qty: 1,
            priceKopiykas: -500,
            sumKopiykas: -500,
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  it("відхиляє source: 'silpo' (v1 lookup/analyze його не виробляють)", () => {
    const r = ReceiptDraftSchema.safeParse(validDraft({ source: "silpo" }));
    expect(r.success).toBe(false);
  });

  it("відхиляє totalKopiykas < 0", () => {
    const r = ReceiptDraftSchema.safeParse(validDraft({ totalKopiykas: -1 }));
    expect(r.success).toBe(false);
  });

  it("відхиляє відсутній rawPayload", () => {
    const draft = validDraft() as Record<string, unknown>;
    delete draft["rawPayload"];
    const r = ReceiptDraftSchema.safeParse(draft);
    expect(r.success).toBe(false);
  });

  it("відхиляє надто великий rawPayload (>256 KB)", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({ rawPayload: { xml: "x".repeat(300_000) } }),
    );
    expect(r.success).toBe(false);
  });

  it("відхиляє позицію без назви", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({
        items: [
          {
            position: 1,
            name: "",
            qty: 1,
            priceKopiykas: 100,
            sumKopiykas: 100,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  // Review-фікс MINOR: дубль position → 400 ще на схемі, інакше
  // `receipt_items_receipt_id_position_idx` UNIQUE(receipt_id, position)
  // з міграції 121 дав би непіймане 500 при save.
  it("відхиляє дубль position у items (superRefine)", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({
        items: [
          {
            position: 1,
            name: "A",
            qty: 1,
            priceKopiykas: 100,
            sumKopiykas: 100,
          },
          {
            position: 1,
            name: "B",
            qty: 1,
            priceKopiykas: 200,
            sumKopiykas: 200,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("приймає РІЗНІ position у межах одного чека", () => {
    const r = ReceiptDraftSchema.safeParse(
      validDraft({
        items: [
          {
            position: 1,
            name: "A",
            qty: 1,
            priceKopiykas: 100,
            sumKopiykas: 100,
          },
          {
            position: 2,
            name: "B",
            qty: 1,
            priceKopiykas: 200,
            sumKopiykas: 200,
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  // Review-фікс MAJOR (retry-дедуп vision-чеків): опційний clientScanId.
  describe("clientScanId (retry-дедуп vision-чеків)", () => {
    it("приймає чернетку БЕЗ clientScanId (undefined) — не ламає існуючих клієнтів", () => {
      const draft = validDraft() as Record<string, unknown>;
      expect("clientScanId" in draft).toBe(false);
      const r = ReceiptDraftSchema.safeParse(draft);
      expect(r.success).toBe(true);
    });

    it("приймає валідний uuid", () => {
      const r = ReceiptDraftSchema.safeParse(
        validDraft({ clientScanId: "8e6b1f1e-2222-4444-8888-abcdefabcdef" }),
      );
      expect(r.success).toBe(true);
    });

    it("приймає clientScanId: null", () => {
      const r = ReceiptDraftSchema.safeParse(
        validDraft({ clientScanId: null }),
      );
      expect(r.success).toBe(true);
    });

    it("відхиляє невалідний uuid", () => {
      const r = ReceiptDraftSchema.safeParse(
        validDraft({ clientScanId: "not-a-uuid" }),
      );
      expect(r.success).toBe(false);
    });
  });
});

describe("ReceiptLookupRequestSchema", () => {
  it("приймає пʼять полів з QR-URL ДПС кабінету", () => {
    const r = ReceiptLookupRequestSchema.safeParse({
      fn: "4000123456",
      id: "RRO001",
      date: "20260115",
      time: "143210",
      sm: "150.00",
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє зайве поле (strict)", () => {
    const r = ReceiptLookupRequestSchema.safeParse({
      fn: "1",
      id: "1",
      date: "1",
      time: "1",
      sm: "1",
      extra: "nope",
    });
    expect(r.success).toBe(false);
  });

  it.each([
    ["порожній fn", { fn: "", id: "1", date: "1", time: "1", sm: "1" }],
    [
      "CRLF-injection у date",
      { fn: "1", id: "1", date: "1\r\nX-Evil: 1", time: "1", sm: "1" },
    ],
    ["пробіл у sm", { fn: "1", id: "1", date: "1", time: "1", sm: "150 00" }],
  ])("відхиляє %s", (_label, body) => {
    expect(ReceiptLookupRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("ReceiptAnalyzeRequestSchema", () => {
  it("приймає image_base64 + mime_type", () => {
    const r = ReceiptAnalyzeRequestSchema.safeParse({
      image_base64: "a".repeat(200),
      mime_type: "image/jpeg",
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє закоротке зображення", () => {
    const r = ReceiptAnalyzeRequestSchema.safeParse({ image_base64: "abc" });
    expect(r.success).toBe(false);
  });
});

describe("ReceiptSaveRequestSchema", () => {
  it("приймає draft + category", () => {
    const r = ReceiptSaveRequestSchema.safeParse(
      validDraft({ category: "food" }),
    );
    expect(r.success).toBe(true);
  });

  it("відхиляє draft без category", () => {
    const r = ReceiptSaveRequestSchema.safeParse(validDraft());
    expect(r.success).toBe(false);
  });

  it("відхиляє порожню category", () => {
    const r = ReceiptSaveRequestSchema.safeParse(validDraft({ category: "" }));
    expect(r.success).toBe(false);
  });

  it("приймає save-запит з clientScanId (retry-дедуп vision-чеків, review-фікс MAJOR)", () => {
    const r = ReceiptSaveRequestSchema.safeParse(
      validDraft({
        category: "food",
        source: "vision",
        fiscalNum: null,
        clientScanId: "8e6b1f1e-2222-4444-8888-abcdefabcdef",
      }),
    );
    expect(r.success).toBe(true);
  });

  it("відхиляє дубль position навіть з валідною category (superRefine діє й через .extend())", () => {
    const r = ReceiptSaveRequestSchema.safeParse(
      validDraft({
        category: "food",
        items: [
          {
            position: 1,
            name: "A",
            qty: 1,
            priceKopiykas: 100,
            sumKopiykas: 100,
          },
          {
            position: 1,
            name: "B",
            qty: 1,
            priceKopiykas: 200,
            sumKopiykas: 200,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });
});

describe("ReceiptSchema — persisted response shape", () => {
  it("приймає повний persisted receipt з mono-лінком", () => {
    const r = ReceiptSchema.safeParse({
      id: 1,
      source: "dps",
      fiscalNum: "4000123456",
      store: "Сільпо",
      storeTaxId: "12345678",
      purchasedAt: "2026-01-15T12:32:10.000Z",
      totalKopiykas: 15000,
      items: [
        {
          id: 10,
          receiptId: 1,
          position: 1,
          name: "Молоко",
          qty: 1,
          priceKopiykas: 3200,
          sumKopiykas: 3200,
        },
      ],
      link: { txKind: "mono", txRef: "abc123" },
      createdAt: "2026-01-15T12:35:00.000Z",
      updatedAt: "2026-01-15T12:35:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("приймає source: 'silpo' (форвард-сумісність з координацією таблиць)", () => {
    const r = ReceiptSchema.safeParse({
      id: 1,
      source: "silpo",
      fiscalNum: null,
      store: "Сільпо",
      storeTaxId: null,
      purchasedAt: "2026-01-15T12:32:10.000Z",
      totalKopiykas: 100,
      items: [],
      link: null,
      createdAt: "2026-01-15T12:35:00.000Z",
      updatedAt: "2026-01-15T12:35:00.000Z",
    });
    expect(r.success).toBe(true);
  });
});
