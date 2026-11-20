/**
 * Чек із фото без суми (рішення власника 2026-11-19, спека
 * `docs/work/specs/finyk-receipt-total-not-visible.md`): `POST
 * /api/finyk/receipts` з `source: "vision"` і `totalKopiykas: 0`
 * відхиляється помилкою валідації ще до транзакції, тож ні чека, ні
 * ручної витрати на 0 ₴ не зʼявляється. Чек ДПС з нулем іде як раніше.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("../../../db.js", () => ({
  default: { connect: mocks.connect },
}));

import saveReceiptHandler, { RECEIPT_TOTAL_REQUIRED_CODE } from "./save.js";
import { ValidationError } from "../../../obs/errors.js";

function body(overrides: Record<string, unknown> = {}) {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-11-19T10:00:00.000Z",
    totalKopiykas: 0,
    items: [
      {
        position: 1,
        name: "Хліб",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ],
    confidence: 0.6,
    rawPayload: {},
    category: "food",
    ...overrides,
  };
}

function req(payload: unknown): Request {
  return { user: { id: "u1" }, body: payload } as unknown as Request;
}

const res = {} as Response;

beforeEach(() => {
  mocks.connect.mockReset();
});

describe("saveReceiptHandler — чек із фото без суми", () => {
  it("vision з нулем: 400 RECEIPT_TOTAL_REQUIRED із тим самим спонуканням, без звернення до бази", async () => {
    const err = await saveReceiptHandler(req(body()), res).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({
      status: 400,
      code: RECEIPT_TOTAL_REQUIRED_CODE,
      message: "Підсумку на фото не видно, введи суму.",
    });
    expect(RECEIPT_TOTAL_REQUIRED_CODE).toBe("RECEIPT_TOTAL_REQUIRED");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("vision із сумою проходить валідацію і йде в транзакцію", async () => {
    const reached = new Error("reached-db");
    mocks.connect.mockRejectedValue(reached);
    await expect(
      saveReceiptHandler(req(body({ totalKopiykas: 3200 })), res),
    ).rejects.toBe(reached);
  });

  it("чек ДПС з нулем поводиться як раніше (не відхиляється)", async () => {
    const reached = new Error("reached-db");
    mocks.connect.mockRejectedValue(reached);
    await expect(
      saveReceiptHandler(
        req(body({ source: "dps", fiscalNum: "4000123456" })),
        res,
      ),
    ).rejects.toBe(reached);
  });
});
