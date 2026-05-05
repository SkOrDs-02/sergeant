import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  startPgContainer,
  stopPgContainer,
  testQuery,
  truncateAll,
} from "../../test/pg-container.js";

// AI-NOTE: This test uses a real Postgres container via Testcontainers.
// It catches SQL-level issues (schema drift, bigint→string coercion, FK
// violations) that mocked unit tests cannot detect. See AGENTS.md rule #1.

let accountsHandler: typeof import("./read.js").accountsHandler;
let transactionsHandler: typeof import("./read.js").transactionsHandler;

/**
 * Wires the `query` import in `read.ts` to the Testcontainers pool. We
 * dynamically import the module after mocking `../../db.js` so the
 * handlers call our real database instead of the production pool.
 */
beforeAll(async () => {
  const pool = await startPgContainer();

  // Mock the db module to delegate to the test container's pool.
  const { vi } = await import("vitest");
  vi.doMock("../../db.js", () => ({
    query: (text: string, values?: unknown[]) => pool.query(text, values),
    pool,
    default: pool,
    ensureSchema: vi.fn().mockResolvedValue(undefined),
  }));

  const mod = await import("./read.js");
  accountsHandler = mod.accountsHandler;
  transactionsHandler = mod.transactionsHandler;
});

afterAll(async () => {
  await stopPgContainer();
});

// -- helpers ------------------------------------------------------------------

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
  userId = "test_user_1",
): Request {
  return {
    method: "GET",
    query,
    user: { id: userId },
  } as unknown as Request;
}

const TEST_USER_ID = "test_user_1";

async function seedTestUser(): Promise<void> {
  await testQuery(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, "Test User", "test@example.com"],
  );
}

// -- tests --------------------------------------------------------------------

describe("mono/read — integration (real Postgres)", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedTestUser();
  });

  describe("accountsHandler", () => {
    it("returns empty array when user has no accounts", async () => {
      const res = makeRes();
      await accountsHandler(makeReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns accounts with bigint columns coerced to numbers", async () => {
      await testQuery(
        `INSERT INTO mono_account
           (user_id, mono_account_id, type, currency_code, cashback_type,
            masked_pan, iban, balance, credit_limit, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          TEST_USER_ID,
          "acct_black",
          "black",
          980,
          "UAH",
          ["5375****1234"],
          "UA123456789012345678901234567",
          // balance and credit_limit are BIGINT — Postgres returns as string
          4678900,
          0,
          new Date("2026-01-15T10:00:00Z"),
        ],
      );

      const res = makeRes();
      await accountsHandler(makeReq(), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        monoAccountId: "acct_black",
        type: "black",
        currencyCode: 980,
        cashbackType: "UAH",
        iban: "UA123456789012345678901234567",
      });

      // Critical: bigint columns MUST be numbers, not strings.
      expect(typeof body[0]!["balance"]).toBe("number");
      expect(body[0]!["balance"]).toBe(4678900);
      expect(typeof body[0]!["creditLimit"]).toBe("number");
      expect(body[0]!["creditLimit"]).toBe(0);

      // maskedPan should be an array
      expect(body[0]!["maskedPan"]).toEqual(["5375****1234"]);
      // lastSeenAt should be ISO string
      expect(body[0]!["lastSeenAt"]).toBe("2026-01-15T10:00:00.000Z");
    });

    it("handles null balance/creditLimit from real Postgres", async () => {
      await testQuery(
        `INSERT INTO mono_account
           (user_id, mono_account_id, type, currency_code, balance, credit_limit)
         VALUES ($1, $2, $3, $4, NULL, NULL)`,
        [TEST_USER_ID, "acct_null", "white", 840],
      );

      const res = makeRes();
      await accountsHandler(makeReq(), res);

      const body = res.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]!["balance"]).toBeNull();
      expect(body[0]!["creditLimit"]).toBeNull();
    });

    it("returns 401 if no user in request", async () => {
      const res = makeRes();
      await accountsHandler({ query: {} } as unknown as Request, res);
      expect(res.statusCode).toBe(401);
    });

    it("orders accounts by currency_code, mono_account_id", async () => {
      // Insert in reverse order to verify sorting
      for (const [acctId, cc] of [
        ["z_acct", 980],
        ["a_acct", 980],
        ["usd_acct", 840],
      ] as const) {
        await testQuery(
          `INSERT INTO mono_account
             (user_id, mono_account_id, type, currency_code, balance, credit_limit)
           VALUES ($1, $2, 'black', $3, 0, 0)`,
          [TEST_USER_ID, acctId, cc],
        );
      }

      const res = makeRes();
      await accountsHandler(makeReq(), res);

      const body = res.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(3);
      // USD (840) first, then UAH (980) sorted by account id
      expect(body[0]!["monoAccountId"]).toBe("usd_acct");
      expect(body[1]!["monoAccountId"]).toBe("a_acct");
      expect(body[2]!["monoAccountId"]).toBe("z_acct");
    });
  });

  describe("transactionsHandler", () => {
    beforeEach(async () => {
      // Seed an account for the transactions FK
      await testQuery(
        `INSERT INTO mono_account
           (user_id, mono_account_id, type, currency_code, balance, credit_limit)
         VALUES ($1, $2, 'black', 980, 100000, 0)`,
        [TEST_USER_ID, "acct_main"],
      );
    });

    it("returns transactions with bigint columns coerced to numbers", async () => {
      await testQuery(
        `INSERT INTO mono_transaction
           (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
            currency_code, mcc, description, cashback_amount, commission_rate,
            balance, source, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          TEST_USER_ID,
          "acct_main",
          "tx_001",
          new Date("2026-04-20T14:30:00Z"),
          -15000, // amount BIGINT
          -15000, // operation_amount BIGINT
          980,
          5411,
          "АТБ-Маркет",
          75, // cashback_amount BIGINT
          0, // commission_rate BIGINT
          85000, // balance BIGINT
          "webhook",
          JSON.stringify({ id: "tx_001" }),
        ],
      );

      const res = makeRes();
      await transactionsHandler(makeReq(), res);

      expect(res.statusCode).toBe(200);
      const { data } = res.body as {
        data: Array<Record<string, unknown>>;
        nextCursor: string | null;
      };
      expect(data).toHaveLength(1);

      const tx = data[0];
      // All BIGINT columns must be numbers
      expect(typeof tx!["amount"]).toBe("number");
      expect(tx!["amount"]).toBe(-15000);
      expect(typeof tx!["operationAmount"]).toBe("number");
      expect(tx!["operationAmount"]).toBe(-15000);
      expect(typeof tx!["cashbackAmount"]).toBe("number");
      expect(tx!["cashbackAmount"]).toBe(75);
      expect(typeof tx!["commissionRate"]).toBe("number");
      expect(tx!["commissionRate"]).toBe(0);
      expect(typeof tx!["balance"]).toBe("number");
      expect(tx!["balance"]).toBe(85000);

      // Time fields should be ISO strings
      expect(tx!["time"]).toBe("2026-04-20T14:30:00.000Z");
      expect(typeof tx!["receivedAt"]).toBe("string");
    });

    it("returns cursor-based pagination", async () => {
      // Insert 3 transactions
      for (let i = 1; i <= 3; i++) {
        await testQuery(
          `INSERT INTO mono_transaction
             (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
              currency_code, description, source, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            TEST_USER_ID,
            "acct_main",
            `tx_page_${String(i).padStart(3, "0")}`,
            new Date(`2026-04-${String(20 + i).padStart(2, "0")}T12:00:00Z`),
            -1000 * i,
            -1000 * i,
            980,
            `Transaction ${i}`,
            "backfill",
            JSON.stringify({ id: `tx_page_${i}` }),
          ],
        );
      }

      // Request with limit=2 — should get 2 items + nextCursor
      const res = makeRes();
      await transactionsHandler(makeReq({ limit: "2" }), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        data: Array<Record<string, unknown>>;
        nextCursor: string | null;
      };
      expect(body.data).toHaveLength(2);
      expect(body.nextCursor).toBeTruthy();
      // Sorted DESC — newest first
      expect(body!.data[0]!["monoTxId"]).toBe("tx_page_003");
      expect(body!.data[1]!["monoTxId"]).toBe("tx_page_002");
    });

    it("catches SQL errors from invalid schema assumptions", async () => {
      // This test verifies that migrations create the correct schema.
      // A query referencing a column that doesn't exist would throw here,
      // which mocked tests can never catch.
      const res = makeRes();
      await transactionsHandler(
        makeReq({ from: "2026-01-01", to: "2026-12-31", limit: "10" }),
        res,
      );
      expect(res.statusCode).toBe(200);
    });
  });
});
