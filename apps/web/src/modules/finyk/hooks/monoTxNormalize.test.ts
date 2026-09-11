import { describe, it, expect } from "vitest";
import type { MonoTransactionDto } from "@shared/api";
import { webhookTxToNormalized } from "./monoTxNormalize";

function baseDto(overrides: Partial<MonoTransactionDto>): MonoTransactionDto {
  return {
    userId: "u1",
    monoAccountId: "acc1",
    monoTxId: "tx1",
    time: "2026-09-11T09:00:00Z",
    amount: -170000,
    operationAmount: -170000,
    currencyCode: 980,
    mcc: 4829,
    originalMcc: null,
    hold: false,
    description: "Погашення кредитки",
    comment: null,
    cashbackAmount: null,
    commissionRate: null,
    balance: 0,
    receiptId: null,
    invoiceId: null,
    counterEdrpou: null,
    counterIban: null,
    counterName: null,
    categorySlug: null,
    categoryOverridden: false,
    source: "webhook",
    receivedAt: "2026-09-11T09:00:01Z",
    ...overrides,
  };
}

describe("webhookTxToNormalized — categoryId з серверного categorySlug", () => {
  it("для витрати переносить categorySlug у categoryId (фікс 2026-09-11: платіж по кредитці)", () => {
    const dto = baseDto({ mcc: 4829, categorySlug: "debt" });
    expect(webhookTxToNormalized(dto).categoryId).toBe("debt");
  });

  it("не переносить categorySlug для надходження — інакше рефанд з відомим MCC мерчанта показав би категорію витрати", () => {
    const dto = baseDto({
      amount: 5000,
      operationAmount: 5000,
      mcc: 5411,
      description: "Повернення, Сільпо",
      categorySlug: "food",
    });
    expect(webhookTxToNormalized(dto).categoryId).toBe("");
  });

  it("null categorySlug (невідомий MCC) не ламає нормалізацію", () => {
    const dto = baseDto({ categorySlug: null });
    expect(webhookTxToNormalized(dto).categoryId).toBe("");
  });
});
