import { describe, it, expect } from "vitest";
import { BillingCancelResponseSchema, BillingSubscriptionSchema } from "./api";

const ACTIVE_SUBSCRIPTION = {
  id: 42,
  provider: "liqpay",
  plan: "pro",
  status: "active",
  active: true,
  currentPeriodEnd: "2026-06-20T00:00:00.000Z",
} as const;

describe("BillingSubscriptionSchema.cancelAtPeriodEnd", () => {
  it("зберігає true: підписку скасовано, доступ діє до кінця періоду", () => {
    expect(
      BillingSubscriptionSchema.parse({
        ...ACTIVE_SUBSCRIPTION,
        cancelAtPeriodEnd: true,
      }).cancelAtPeriodEnd,
    ).toBe(true);
  });

  // Web (Vercel) і сервер (Coolify) деплояться окремо: новий клієнт читає
  // відповідь старого сервера, який поля ще не віддає.
  it("за відсутності поля (старий сервер) дефолтить у false, а не кидає", () => {
    expect(
      BillingSubscriptionSchema.parse(ACTIVE_SUBSCRIPTION).cancelAtPeriodEnd,
    ).toBe(false);
  });

  it("не приймає не-boolean: рядок 'false' зі строкового pg-значення був би truthy", () => {
    expect(() =>
      BillingSubscriptionSchema.parse({
        ...ACTIVE_SUBSCRIPTION,
        cancelAtPeriodEnd: "false",
      }),
    ).toThrow();
  });

  it("null-форма підписки (немає рядка) теж несе false", () => {
    expect(
      BillingSubscriptionSchema.parse({
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      }).cancelAtPeriodEnd,
    ).toBe(false);
  });
});

describe("BillingCancelResponseSchema", () => {
  it("приймає лише ok:true: помилки йдуть non-2xx, а не ok:false", () => {
    expect(BillingCancelResponseSchema.parse({ ok: true })).toEqual({
      ok: true,
    });
    expect(() => BillingCancelResponseSchema.parse({ ok: false })).toThrow();
  });
});
