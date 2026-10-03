import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../../db.js", () => ({ default: { query: vi.fn() } }));

import pool from "../../../db.js";
import getReceiptHandler from "./get.js";

const queryMock = (pool as unknown as { query: Mock }).query;

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

function makeReq(id: string, userId = "u1"): Request {
  return { user: { id: userId }, params: { id } } as unknown as Request;
}

const RECEIPT_ROW = {
  id: "1",
  user_id: "u1",
  source: "dps",
  fiscal_num: "4000123456",
  store_name: "Сільпо",
  store_tax_id: "30363252",
  purchased_at: "2026-01-15T12:32:10.000Z",
  total_kopiykas: "15000",
  created_at: "2026-01-15T12:35:00.000Z",
  updated_at: "2026-01-15T12:35:00.000Z",
};

const ITEM_ROW = {
  id: "10",
  receipt_id: "1",
  position: 1,
  name: "Молоко",
  qty: "1.000",
  price_kopiykas: "3200",
  sum_kopiykas: "3200",
};

function dispatch(
  receiptRows: unknown[],
  itemRows: unknown[] = [],
  linkRows: unknown[] = [],
) {
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM receipts/s.test(sql)) return { rows: receiptRows };
    if (/FROM receipt_items/s.test(sql)) return { rows: itemRows };
    if (/FROM finyk_tx_receipt_links/s.test(sql)) return { rows: linkRows };
    throw new Error(`get.test.ts: unhandled SQL: ${sql}`);
  });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getReceiptHandler", () => {
  it("400 ValidationError на нечисловий id", async () => {
    await expect(
      getReceiptHandler(makeReq("abc"), makeRes()),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("400 ValidationError на id <= 0", async () => {
    await expect(
      getReceiptHandler(makeReq("0"), makeRes()),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      getReceiptHandler(makeReq("-5"), makeRes()),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("404 NotFoundError, коли чек не існує / належить іншому користувачу", async () => {
    dispatch([]); // жодного рядка — і "не існує", і "чужий" виглядають однаково
    await expect(
      getReceiptHandler(makeReq("999"), makeRes()),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("скоупить SELECT по user_id з сесії, не з довільного джерела", async () => {
    dispatch([RECEIPT_ROW]);
    await getReceiptHandler(makeReq("1", "session-user"), makeRes());

    const receiptCall = queryMock.mock.calls.find((c) =>
      /FROM receipts/s.test(String(c[0])),
    );
    expect(receiptCall?.[1]).toEqual([1, "session-user"]);
  });

  it("happy path: повертає receipt із коерсованими позиціями і лінком", async () => {
    dispatch(
      [RECEIPT_ROW],
      [ITEM_ROW],
      [{ tx_kind: "mono", tx_ref: "mono-1" }],
    );

    const res = makeRes();
    await getReceiptHandler(makeReq("1"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { receipt: Record<string, unknown> };
    expect(body.receipt["id"]).toBe(1);
    expect(typeof body.receipt["id"]).toBe("number");
    expect(body.receipt["totalKopiykas"]).toBe(15000);
    expect(body.receipt["items"]).toEqual([
      {
        id: 10,
        receiptId: 1,
        position: 1,
        name: "Молоко",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ]);
    expect(body.receipt["link"]).toEqual({ txKind: "mono", txRef: "mono-1" });
  });

  it("link: null, коли чек ще не привʼязаний", async () => {
    dispatch([RECEIPT_ROW], [], []);
    const res = makeRes();
    await getReceiptHandler(makeReq("1"), res);
    const body = res.body as { receipt: Record<string, unknown> };
    expect(body.receipt["link"]).toBeNull();
    expect(body.receipt["items"]).toEqual([]);
  });
});
