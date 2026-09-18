import { describe, expect, it } from "vitest";
import {
  normalizeSilpoReceiptDetail,
  normalizeSilpoReceiptItem,
  normalizeSilpoReceiptSummary,
} from "./silpo.js";

/**
 * Hard Rule #1 — `pg` returns BIGINT columns (`total_kop`, `price_kop`,
 * `silpo_receipt_items.id`) as strings. These tests pin the string→number
 * coercion so a regression here (issue #708-class bug) fails loudly instead
 * of shipping `"12345"` to the client, where `"1"+"2"` silently becomes
 * `"12"`.
 */
describe("normalizeSilpoReceiptItem", () => {
  it("coerces BIGINT id/priceKop strings to number", () => {
    const normalized = normalizeSilpoReceiptItem({
      id: "42",
      name: "Хліб",
      qty: "1.5",
      unit: "шт",
      priceKop: "3000",
      categorySlug: "bakery",
      barcode: "4820000000017",
    });

    expect(normalized).toEqual({
      id: 42,
      name: "Хліб",
      qty: 1.5,
      unit: "шт",
      priceKop: 3000,
      categorySlug: "bakery",
      barcode: "4820000000017",
    });
    expect(typeof normalized.id).toBe("number");
    expect(typeof normalized.priceKop).toBe("number");
  });

  it("keeps qty null when the column is null", () => {
    const normalized = normalizeSilpoReceiptItem({
      id: "1",
      name: "Молоко",
      qty: null,
      unit: null,
      priceKop: "4500",
      categorySlug: null,
      barcode: null,
    });
    expect(normalized.qty).toBeNull();
  });
});

describe("normalizeSilpoReceiptSummary", () => {
  it("coerces total_kop and Date→ISO string", () => {
    const normalized = normalizeSilpoReceiptSummary({
      receiptId: "r1",
      purchasedAt: new Date("2026-08-10T12:00:00.000Z"),
      storeId: "store-1",
      channel: "offline",
      paymentHint: null,
      totalKop: "12345",
      transactionId: "tx-1",
    });

    expect(normalized).toEqual({
      receiptId: "r1",
      purchasedAt: "2026-08-10T12:00:00.000Z",
      storeId: "store-1",
      channel: "offline",
      paymentHint: null,
      totalKop: 12345,
      transactionId: "tx-1",
    });
    expect(typeof normalized.totalKop).toBe("number");
  });

  it("passes through an already-ISO purchasedAt string unchanged", () => {
    const normalized = normalizeSilpoReceiptSummary({
      receiptId: "r2",
      purchasedAt: "2026-08-09T08:00:00.000Z",
      storeId: null,
      channel: "online",
      paymentHint: null,
      totalKop: 100,
      transactionId: null,
    });
    expect(normalized.purchasedAt).toBe("2026-08-09T08:00:00.000Z");
  });
});

describe("normalizeSilpoReceiptDetail", () => {
  it("combines the receipt summary with coerced item rows", () => {
    const detail = normalizeSilpoReceiptDetail(
      {
        receiptId: "r1",
        purchasedAt: "2026-08-10T12:00:00.000Z",
        storeId: null,
        channel: "offline",
        paymentHint: null,
        totalKop: "5000",
        transactionId: null,
      },
      [
        {
          id: "1",
          name: "Хліб",
          qty: "1",
          unit: "шт",
          priceKop: "3000",
          categorySlug: null,
          barcode: null,
        },
        {
          id: "2",
          name: "Молоко",
          qty: "1",
          unit: "шт",
          priceKop: "2000",
          categorySlug: "dairy",
          barcode: "4820000000017",
        },
      ],
    );

    expect(detail.totalKop).toBe(5000);
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({ id: 1, priceKop: 3000 });
    expect(detail.items[1]).toMatchObject({ id: 2, priceKop: 2000 });
  });
});
