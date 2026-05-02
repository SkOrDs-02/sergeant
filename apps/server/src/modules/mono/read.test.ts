import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => ({
  query: vi.fn(),
}));

import { query as _query } from "../../db.js";
import { accountsHandler, transactionsHandler } from "./read.js";

const queryMock = _query as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(
  query: Record<string, string> = {},
  userId = "user_1",
): Request {
  return {
    method: "GET",
    query,
    user: { id: userId },
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accountsHandler", () => {
  it("returns accounts for authenticated user", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acc1",
          sendId: null,
          type: "black",
          currencyCode: 980,
          cashbackType: "UAH",
          maskedPan: ["5375****1234"],
          iban: "UA123",
          balance: 10000,
          creditLimit: 0,
          lastSeenAt: new Date("2025-01-01T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await accountsHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].monoAccountId).toBe("acc1");
    expect(body[0].lastSeenAt).toBe("2025-01-01T00:00:00.000Z");
    expect(body[0].maskedPan).toEqual(["5375****1234"]);
  });

  it("returns empty array when no accounts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await accountsHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 if no user", async () => {
    const res = makeRes();
    await accountsHandler({ query: {} } as unknown as Request, res);

    expect(res.statusCode).toBe(401);
  });

  it("coerces bigint string columns (balance, creditLimit) to numbers", async () => {
    // node-postgres returns bigint columns as strings by default. The
    // client computes `!a.creditLimit` — non-empty string "0" is truthy
    // and would silently exclude all non-credit cards from "На картках".
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "white",
          type: "white",
          currencyCode: 980,
          cashbackType: null,
          maskedPan: ["444111******0131"],
          iban: null,
          balance: "46789",
          creditLimit: "0",
          lastSeenAt: new Date("2025-01-01T00:00:00Z"),
          sendId: null,
        },
        {
          userId: "user_1",
          monoAccountId: "black",
          type: "black",
          currencyCode: 980,
          cashbackType: null,
          maskedPan: ["444111******3551"],
          iban: null,
          balance: "-42739",
          creditLimit: "4000000",
          lastSeenAt: new Date("2025-01-01T00:00:00Z"),
          sendId: null,
        },
      ],
    });

    const res = makeRes();
    await accountsHandler(makeReq(), res);

    const body = res.body as Array<Record<string, unknown>>;
    expect(body[0].balance).toBe(46789);
    expect(body[0].creditLimit).toBe(0);
    expect(typeof body[0].balance).toBe("number");
    expect(typeof body[0].creditLimit).toBe("number");
    expect(body[1].balance).toBe(-42739);
    expect(body[1].creditLimit).toBe(4000000);
  });

  it("preserves null balance/creditLimit", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acc1",
          type: null,
          currencyCode: 980,
          cashbackType: null,
          maskedPan: null,
          iban: null,
          balance: null,
          creditLimit: null,
          lastSeenAt: new Date("2025-01-01T00:00:00Z"),
          sendId: null,
        },
      ],
    });

    const res = makeRes();
    await accountsHandler(makeReq(), res);

    const body = res.body as Array<Record<string, unknown>>;
    expect(body[0].balance).toBeNull();
    expect(body[0].creditLimit).toBeNull();
  });

  it("accountsHandler response shape matches snapshot", async () => {
    // Fixture simulates node-postgres returning BIGINT columns as strings.
    // balance (BIGINT), credit_limit (BIGINT) arrive as strings from pg.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acct_black",
          sendId: "send_abc",
          type: "black",
          currencyCode: 980,
          cashbackType: "UAH",
          maskedPan: ["5375****1234"],
          iban: "UA213223130000026007233566001",
          balance: "1234500",
          creditLimit: "0",
          lastSeenAt: new Date("2025-06-15T10:30:00Z"),
        },
        {
          userId: "user_1",
          monoAccountId: "acct_white",
          sendId: null,
          type: "white",
          currencyCode: 840,
          cashbackType: null,
          maskedPan: ["4111****5678"],
          iban: null,
          balance: "-50000",
          creditLimit: "10000000",
          lastSeenAt: new Date("2025-06-15T09:00:00Z"),
        },
        {
          userId: "user_1",
          monoAccountId: "acct_fop",
          sendId: null,
          type: "fop",
          currencyCode: 980,
          cashbackType: null,
          maskedPan: null,
          iban: "UA543210000000260099887766",
          balance: null,
          creditLimit: null,
          lastSeenAt: new Date("2025-06-14T18:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await accountsHandler(makeReq(), res);

    expect(res.body).toMatchSnapshot();
  });
});

describe("transactionsHandler", () => {
  it("returns transactions with cursor pagination", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      userId: "user_1",
      monoAccountId: "acc1",
      monoTxId: `tx_${i}`,
      time: new Date(
        `2025-01-15T${String(12 - Math.floor(i / 6)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
      ),
      amount: -(i + 1) * 100,
      operationAmount: -(i + 1) * 100,
      currencyCode: 980,
      mcc: null,
      originalMcc: null,
      hold: false,
      description: `tx ${i}`,
      comment: null,
      cashbackAmount: null,
      commissionRate: null,
      balance: 100000 - i * 100,
      receiptId: null,
      invoiceId: null,
      counterEdrpou: null,
      counterIban: null,
      counterName: null,
      categorySlug: null,
      categoryOverridden: false,
      source: "backfill",
      receivedAt: new Date("2025-01-15T00:00:00Z"),
    }));

    queryMock.mockResolvedValueOnce({ rows });

    const res = makeRes();
    await transactionsHandler(makeReq({}), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { data: unknown[]; nextCursor: string | null };
    expect(body.data).toHaveLength(50);
    expect(body.nextCursor).toBeTruthy();
  });

  it("returns null nextCursor when no more results", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acc1",
          monoTxId: "tx_1",
          time: new Date("2025-01-15T12:00:00Z"),
          amount: -100,
          operationAmount: -100,
          currencyCode: 980,
          mcc: null,
          originalMcc: null,
          hold: false,
          description: "test",
          comment: null,
          cashbackAmount: null,
          commissionRate: null,
          balance: 100000,
          receiptId: null,
          invoiceId: null,
          counterEdrpou: null,
          counterIban: null,
          counterName: null,
          categorySlug: null,
          categoryOverridden: false,
          source: "webhook",
          receivedAt: new Date("2025-01-15T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await transactionsHandler(makeReq({}), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { data: unknown[]; nextCursor: string | null };
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("applies from/to/accountId filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await transactionsHandler(
      makeReq({
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-31T23:59:59Z",
        accountId: "acc1",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("t.time >=");
    expect(sql).toContain("t.time <=");
    expect(sql).toContain("t.mono_account_id =");
  });

  it("applies cursor filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await transactionsHandler(
      makeReq({
        cursor: "2025-01-15T12:00:00.000Z:tx_25",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("t.time <");
    expect(sql).toContain("t.mono_tx_id <");
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params).toContain("2025-01-15T12:00:00.000Z");
    expect(params).toContain("tx_25");
  });

  it("returns 401 if no user", async () => {
    const res = makeRes();
    await transactionsHandler({ query: {} } as unknown as Request, res);

    expect(res.statusCode).toBe(401);
  });

  it("coerces bigint string columns (amount, balance, etc.) to numbers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acc1",
          monoTxId: "tx_1",
          time: new Date("2025-01-15T12:00:00Z"),
          amount: "-12345",
          operationAmount: "-12345",
          currencyCode: 980,
          mcc: 5411,
          originalMcc: 5411,
          hold: false,
          description: "test",
          comment: null,
          cashbackAmount: "100",
          commissionRate: "0",
          balance: "987654",
          receiptId: null,
          invoiceId: null,
          counterEdrpou: null,
          counterIban: null,
          counterName: null,
          categorySlug: "groceries",
          categoryOverridden: false,
          source: "webhook",
          receivedAt: new Date("2025-01-15T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await transactionsHandler(makeReq({}), res);

    const body = res.body as { data: Array<Record<string, unknown>> };
    const tx = body.data[0];
    expect(tx.amount).toBe(-12345);
    expect(tx.operationAmount).toBe(-12345);
    expect(tx.cashbackAmount).toBe(100);
    expect(tx.commissionRate).toBe(0);
    expect(tx.balance).toBe(987654);
    expect(typeof tx.amount).toBe("number");
    expect(typeof tx.commissionRate).toBe("number");
  });

  it("transactionsHandler response shape matches snapshot", async () => {
    // Fixture simulates node-postgres returning BIGINT columns as strings.
    // amount, operation_amount, cashback_amount, commission_rate, balance
    // are all BIGINT in the DB and arrive as strings from pg.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "user_1",
          monoAccountId: "acct_black",
          monoTxId: "AbCdEfGhIj",
          time: new Date("2025-06-15T14:23:11Z"),
          amount: "-8900",
          operationAmount: "-8900",
          currencyCode: 980,
          mcc: 5411,
          originalMcc: 5411,
          hold: false,
          description: "АТБ-Маркет",
          comment: "продукти",
          cashbackAmount: "89",
          commissionRate: "0",
          balance: "4567800",
          receiptId: "XXXX-XXXX-XXXX-XXXX",
          invoiceId: null,
          counterEdrpou: "12345678",
          counterIban: "UA111222333444555666777888999",
          counterName: "ТОВ АТБ-МАРКЕТ",
          categorySlug: "groceries",
          categoryOverridden: false,
          source: "webhook",
          receivedAt: new Date("2025-06-15T14:23:12Z"),
        },
        {
          userId: "user_1",
          monoAccountId: "acct_black",
          monoTxId: "KlMnOpQrSt",
          time: new Date("2025-06-15T11:05:00Z"),
          amount: "-250000",
          operationAmount: "-250000",
          currencyCode: 980,
          mcc: 4829,
          originalMcc: null,
          hold: true,
          description: "Переказ на картку",
          comment: null,
          cashbackAmount: null,
          commissionRate: null,
          balance: "4817800",
          receiptId: null,
          invoiceId: null,
          counterEdrpou: null,
          counterIban: null,
          counterName: "Іваненко Петро",
          categorySlug: null,
          categoryOverridden: true,
          source: "backfill",
          receivedAt: new Date("2025-06-15T12:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await transactionsHandler(makeReq({}), res);

    expect(res.body).toMatchSnapshot();
  });
});
