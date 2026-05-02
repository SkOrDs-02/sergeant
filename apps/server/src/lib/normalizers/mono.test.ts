import { describe, it, expect } from "vitest";
import {
  toNumberOrNull,
  normalizeMonoAccount,
  normalizeMonoTransaction,
} from "./mono.js";

// ─── toNumberOrNull ──────────────────────────────────────────────────────────

describe("toNumberOrNull", () => {
  it("returns number as-is", () => {
    expect(toNumberOrNull(42)).toBe(42);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull(-100)).toBe(-100);
  });

  it("coerces string to number", () => {
    expect(toNumberOrNull("123")).toBe(123);
    expect(toNumberOrNull("0")).toBe(0);
    expect(toNumberOrNull("-50")).toBe(-50);
  });

  it("coerces bigint to number", () => {
    expect(toNumberOrNull(42n)).toBe(42);
    expect(toNumberOrNull(0n)).toBe(0);
  });

  it("returns null for null", () => {
    expect(toNumberOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it("returns null for non-coercible types", () => {
    expect(toNumberOrNull({})).toBeNull();
    expect(toNumberOrNull([])).toBeNull();
    expect(toNumberOrNull(true)).toBeNull();
  });
});

// ─── normalizeMonoAccount ────────────────────────────────────────────────────

describe("normalizeMonoAccount", () => {
  it("happy path: coerces bigint balance/creditLimit, serializes Date", () => {
    const result = normalizeMonoAccount({
      userId: "u1",
      monoAccountId: "acc1",
      sendId: "s1",
      type: "black",
      currencyCode: 980,
      cashbackType: "UAH",
      maskedPan: ["4444****1111"],
      iban: "UA123",
      balance: "10000",
      creditLimit: "0",
      lastSeenAt: new Date("2026-04-26T12:00:00Z"),
    });
    expect(result.balance).toBe(10000);
    expect(result.creditLimit).toBe(0);
    expect(result.lastSeenAt).toBe("2026-04-26T12:00:00.000Z");
  });

  it("handles null maskedPan by defaulting to empty array", () => {
    const result = normalizeMonoAccount({
      userId: "u1",
      monoAccountId: "acc1",
      sendId: null,
      type: "black",
      currencyCode: 980,
      cashbackType: null,
      maskedPan: null,
      iban: null,
      balance: 5000,
      creditLimit: null,
      lastSeenAt: null,
    });
    expect(result.maskedPan).toEqual([]);
    expect(result.creditLimit).toBeNull();
    expect(result.lastSeenAt).toBeNull();
  });

  it("handles string lastSeenAt (ISO string from DB)", () => {
    const result = normalizeMonoAccount({
      userId: "u1",
      monoAccountId: "acc1",
      sendId: null,
      type: "black",
      currencyCode: 980,
      cashbackType: null,
      maskedPan: [],
      iban: null,
      balance: 0,
      creditLimit: 0,
      lastSeenAt: "2026-04-26T12:00:00.000Z",
    });
    expect(result.lastSeenAt).toBe("2026-04-26T12:00:00.000Z");
  });

  it("handles bigint balance from pg driver (string '0')", () => {
    const result = normalizeMonoAccount({
      userId: "u1",
      monoAccountId: "acc1",
      sendId: null,
      type: "black",
      currencyCode: 980,
      cashbackType: null,
      maskedPan: [],
      iban: null,
      balance: "0",
      creditLimit: "0",
      lastSeenAt: null,
    });
    expect(result.balance).toBe(0);
    expect(result.creditLimit).toBe(0);
  });
});

// ─── normalizeMonoTransaction ────────────────────────────────────────────────

describe("normalizeMonoTransaction", () => {
  const baseRow = {
    userId: "u1",
    monoAccountId: "acc1",
    monoTxId: "tx1",
    time: new Date("2026-04-26T10:00:00Z"),
    amount: "-5000",
    operationAmount: "-5000",
    currencyCode: 980,
    mcc: 5411,
    originalMcc: null,
    hold: false,
    description: "Сільпо",
    comment: null,
    cashbackAmount: "50",
    commissionRate: "0",
    balance: "100000",
    receiptId: null,
    invoiceId: null,
    counterEdrpou: null,
    counterIban: null,
    counterName: null,
    categorySlug: "food" as string | null,
    categoryOverridden: false,
    source: "webhook",
    receivedAt: new Date("2026-04-26T10:00:01Z"),
  };

  it("happy path: coerces numeric fields and serializes dates", () => {
    const result = normalizeMonoTransaction(baseRow);
    expect(result.amount).toBe(-5000);
    expect(result.operationAmount).toBe(-5000);
    expect(result.cashbackAmount).toBe(50);
    expect(result.commissionRate).toBe(0);
    expect(result.balance).toBe(100000);
    expect(result.time).toBe("2026-04-26T10:00:00.000Z");
    expect(result.receivedAt).toBe("2026-04-26T10:00:01.000Z");
  });

  it("defaults amount and operationAmount to 0 when null", () => {
    const result = normalizeMonoTransaction({
      ...baseRow,
      amount: null,
      operationAmount: null,
    });
    expect(result.amount).toBe(0);
    expect(result.operationAmount).toBe(0);
  });

  it("handles string time (already ISO from DB)", () => {
    const result = normalizeMonoTransaction({
      ...baseRow,
      time: "2026-04-26T10:00:00.000Z",
      receivedAt: "2026-04-26T10:00:01.000Z",
    });
    expect(result.time).toBe("2026-04-26T10:00:00.000Z");
    expect(result.receivedAt).toBe("2026-04-26T10:00:01.000Z");
  });

  it("handles null optional numeric fields gracefully", () => {
    const result = normalizeMonoTransaction({
      ...baseRow,
      cashbackAmount: null,
      commissionRate: null,
      balance: null,
    });
    expect(result.cashbackAmount).toBeNull();
    expect(result.commissionRate).toBeNull();
    expect(result.balance).toBeNull();
  });

  it("preserves non-numeric fields unchanged", () => {
    const result = normalizeMonoTransaction(baseRow);
    expect(result.userId).toBe("u1");
    expect(result.monoAccountId).toBe("acc1");
    expect(result.monoTxId).toBe("tx1");
    expect(result.mcc).toBe(5411);
    expect(result.description).toBe("Сільпо");
    expect(result.source).toBe("webhook");
  });

  it("проносить categorySlug і categoryOverridden as-is", () => {
    expect(normalizeMonoTransaction(baseRow).categorySlug).toBe("food");
    expect(normalizeMonoTransaction(baseRow).categoryOverridden).toBe(false);

    const overridden = normalizeMonoTransaction({
      ...baseRow,
      categorySlug: "transport",
      categoryOverridden: true,
    });
    expect(overridden.categorySlug).toBe("transport");
    expect(overridden.categoryOverridden).toBe(true);

    const uncategorized = normalizeMonoTransaction({
      ...baseRow,
      categorySlug: null,
    });
    expect(uncategorized.categorySlug).toBeNull();
  });
});
