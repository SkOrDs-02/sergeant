import { describe, it, expect } from "vitest";
import {
  serializeReceipt,
  serializeReceiptItem,
  type ReceiptItemRow,
  type ReceiptLinkRow,
  type ReceiptRow,
} from "./serialize.js";

// AI-DANGER: `pg` віддає bigint-колонки РЯДКАМИ (Hard Rule #1, issue
// #708). Фікстури нижче навмисно подають bigint/numeric поля як РЯДКИ
// (не числа) — так само, як реально приходить із драйвера, незалежно
// від `installInt8Parser()` (другий рубіж, не заміна).

function receiptRow(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: "42", // bigserial → string
    user_id: "user_1",
    source: "dps",
    fiscal_num: "4000123456",
    store_name: "Сільпо",
    store_tax_id: "30363252",
    purchased_at: "2026-01-15T12:32:10.000Z",
    total_kopiykas: "15000", // bigint → string
    created_at: "2026-01-15T12:35:00.000Z",
    updated_at: "2026-01-15T12:35:00.000Z",
    ...overrides,
  };
}

function itemRow(overrides: Partial<ReceiptItemRow> = {}): ReceiptItemRow {
  return {
    id: "100", // bigserial → string
    receipt_id: "42", // bigint → string
    position: 1,
    name: "Молоко",
    qty: "1.000", // NUMERIC(12,3) → ЗАВЖДИ string з pg (не покрито int8-парсером)
    price_kopiykas: "3200", // bigint → string
    sum_kopiykas: "3200", // bigint → string
    ...overrides,
  };
}

describe("serializeReceiptItem — bigint/numeric coercion (Hard Rule #1)", () => {
  it("коерсить усі bigint/numeric поля у number", () => {
    const out = serializeReceiptItem(itemRow());
    expect(out).toEqual({
      id: 100,
      receiptId: 42,
      position: 1,
      name: "Молоко",
      qty: 1,
      priceKopiykas: 3200,
      sumKopiykas: 3200,
    });
    expect(typeof out.id).toBe("number");
    expect(typeof out.receiptId).toBe("number");
    expect(typeof out.qty).toBe("number");
    expect(typeof out.priceKopiykas).toBe("number");
    expect(typeof out.sumKopiykas).toBe("number");
  });

  it("коерсить дробову NUMERIC(12,3) qty коректно (вагові товари)", () => {
    const out = serializeReceiptItem(itemRow({ qty: "0.345" }));
    expect(out.qty).toBe(0.345);
  });

  it("коерсить від'ємні bigint (рядок знижки)", () => {
    const out = serializeReceiptItem(
      itemRow({ price_kopiykas: "-500", sum_kopiykas: "-500" }),
    );
    expect(out.priceKopiykas).toBe(-500);
    expect(out.sumKopiykas).toBe(-500);
  });

  it("приймає вже-скоерсений number (driver-парсер випередив) без похибки", () => {
    const out = serializeReceiptItem(
      itemRow({
        id: 100,
        receipt_id: 42,
        price_kopiykas: 3200,
        sum_kopiykas: 3200,
      }),
    );
    expect(out).toMatchObject({
      id: 100,
      receiptId: 42,
      priceKopiykas: 3200,
      sumKopiykas: 3200,
    });
  });

  it("кидає (fail loud) на нечислове bigint-поле — не мовчазний NaN", () => {
    expect(() =>
      serializeReceiptItem(itemRow({ price_kopiykas: "not-a-number" })),
    ).toThrow(/price_kopiykas/);
  });
});

describe("serializeReceipt", () => {
  it("коерсить id/total_kopiykas і вкладає позиції + лінк", () => {
    const link: ReceiptLinkRow = { tx_kind: "mono", tx_ref: "mono-tx-1" };
    const out = serializeReceipt(receiptRow(), [itemRow()], link);

    expect(out.id).toBe(42);
    expect(typeof out.id).toBe("number");
    expect(out.totalKopiykas).toBe(15000);
    expect(typeof out.totalKopiykas).toBe("number");
    expect(out.store).toBe("Сільпо"); // store_name → store
    expect(out.fiscalNum).toBe("4000123456");
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe(100);
    expect(out.link).toEqual({ txKind: "mono", txRef: "mono-tx-1" });
  });

  it("link: null, коли чек ще не привʼязаний (не повинно траплятись у нормальній відповіді, але серіалізатор не падає)", () => {
    const out = serializeReceipt(receiptRow(), [], null);
    expect(out.link).toBeNull();
    expect(out.items).toEqual([]);
  });

  it("Date-об'єкти timestamp-полів серіалізуються через toISOString", () => {
    const out = serializeReceipt(
      receiptRow({
        purchased_at: new Date("2026-01-15T12:32:10.000Z"),
        created_at: new Date("2026-01-15T12:35:00.000Z"),
        updated_at: new Date("2026-01-15T12:35:00.000Z"),
      }),
      [],
      null,
    );
    expect(out.purchasedAt).toBe("2026-01-15T12:32:10.000Z");
    expect(out.createdAt).toBe("2026-01-15T12:35:00.000Z");
  });

  it("fiscalNum/storeTaxId: null проходить як null (vision-чек без QR)", () => {
    const out = serializeReceipt(
      receiptRow({ fiscal_num: null, store_tax_id: null, source: "vision" }),
      [],
      null,
    );
    expect(out.fiscalNum).toBeNull();
    expect(out.storeTaxId).toBeNull();
    expect(out.source).toBe("vision");
  });

  it("кидає (fail loud) на нечислове total_kopiykas", () => {
    expect(() =>
      serializeReceipt(receiptRow({ total_kopiykas: "NaN-ish" }), [], null),
    ).toThrow(/total_kopiykas/);
  });
});
