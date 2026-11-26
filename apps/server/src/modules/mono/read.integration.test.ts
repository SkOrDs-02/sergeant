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

    // Регресія на реальному Postgres: заглушка під банку не має верталась
    // як картка. Вебхук змушений заводити для неї рядок у `mono_account`
    // (FK `mono_transaction` → `mono_account`), інакше транзакцію банки
    // нікуди записати. Поки фільтра не було, вона їхала клієнту
    // безіменною «Карткою», а її баланс входив у капітал двічі — як
    // картка і вдруге через `sumJarsUAH`. Знахідка founder-а 2026-08-10,
    // міграція 119.
    it("не віддає заглушки під банки серед рахунків", async () => {
      await testQuery(
        `INSERT INTO mono_account
           (user_id, mono_account_id, type, currency_code, balance, is_jar)
         VALUES ($1, 'acct_white', 'white', 980, 103549, FALSE),
                ($1, 'jar_prosto', NULL,    980, 600000, TRUE)`,
        [TEST_USER_ID],
      );

      const res = makeRes();
      await accountsHandler(makeReq(), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]!["monoAccountId"]).toBe("acct_white");
      // Саме цей рядок і був привидом на скріншоті founder-а.
      expect(body.map((r) => r["monoAccountId"])).not.toContain("jar_prosto");
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

    it("user A accounts are NOT returned when handler is called as user B", async () => {
      const USER_B_ID = "test_user_2";

      // Seed user B row so FK from mono_account can reference it later if
      // needed; more importantly, confirm the handler filters by session user.
      await testQuery(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO NOTHING`,
        [USER_B_ID, "User B", "userb@example.com"],
      );

      // Seed two accounts for user A (TEST_USER_ID).
      for (const [acctId, balance] of [
        ["acct_iso_1", 100_000],
        ["acct_iso_2", 200_000],
      ] as const) {
        await testQuery(
          `INSERT INTO mono_account
             (user_id, mono_account_id, type, currency_code, balance, credit_limit)
           VALUES ($1, $2, 'black', 980, $3, 0)`,
          [TEST_USER_ID, acctId, balance],
        );
      }

      // Call handler as user B → must receive empty array, NOT user A's rows.
      const res = makeRes();
      await accountsHandler(makeReq({}, USER_B_ID), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
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

// Спека finyk-fx-nbu.md: SQL добору `amount_uah`, джойн курсу за київською
// датою і кеш курсів НБУ на справжньому Postgres. Курс сідається в
// `nbu_fx_rate` заздалегідь, тож мережі тест не потребує.
describe("mono/read — валютні рахунки і курс НБУ (real Postgres)", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedTestUser();
  });

  async function seedAccount(id: string, currencyCode: number): Promise<void> {
    await testQuery(
      `INSERT INTO mono_account
         (user_id, mono_account_id, type, currency_code, cashback_type,
          masked_pan, iban, balance, credit_limit, last_seen_at)
       VALUES ($1, $2, 'black', $3, 'None', $4, NULL, 0, 0, now())`,
      [TEST_USER_ID, id, currencyCode, ["5375****0000"]],
    );
  }

  async function seedTx(
    id: string,
    account: string,
    time: string,
    amount: number,
    operationAmount: number,
    currencyCode: number,
  ): Promise<void> {
    await testQuery(
      `INSERT INTO mono_transaction
         (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
          currency_code, description, source, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Shop', 'webhook', '{}'::jsonb)`,
      [
        TEST_USER_ID,
        account,
        id,
        new Date(time),
        amount,
        operationAmount,
        currencyCode,
      ],
    );
  }

  it("добирає amount_uah, віддає курс і не чіпає гривневі й нерозпізнані рахунки", async () => {
    await seedAccount("acct_usd", 840);
    await seedAccount("acct_uah", 980);
    await seedAccount("acct_stub", 0);
    await testQuery(
      `INSERT INTO nbu_fx_rate (currency_code, rate_date, uah_per_unit, source_date)
       VALUES (840, '2026-11-24', 41.5, '2026-11-24')`,
    );
    await seedTx(
      "usd_buy",
      "acct_usd",
      "2026-11-24T10:00:00Z",
      -10_000,
      -10_000,
      840,
    );
    // 23:30 UTC 23-го = 01:30 24-го в Києві; операція в гривні - курс не потрібен.
    await seedTx(
      "usd_card_uah_op",
      "acct_usd",
      "2026-11-23T23:30:00Z",
      -250,
      -10_000,
      980,
    );
    await seedTx(
      "stub_op",
      "acct_stub",
      "2026-11-24T09:00:00Z",
      -700,
      -700,
      840,
    );
    await seedTx(
      "uah_op",
      "acct_uah",
      "2026-11-24T08:00:00Z",
      -5_000,
      -5_000,
      980,
    );

    const res = makeRes();
    await transactionsHandler(makeReq({ limit: "10" }), res);

    expect(res.statusCode).toBe(200);
    const byId = new Map(
      (res.body as { data: Array<Record<string, unknown>> }).data.map((t) => [
        t["monoTxId"],
        t,
      ]),
    );
    expect(byId.get("usd_buy")).toMatchObject({
      amount: -10_000,
      accountCurrencyCode: 840,
      amountUah: -415_000,
      fxRate: { uahPerUnit: 41.5, date: "2026-11-24" },
    });
    expect(byId.get("usd_card_uah_op")).toMatchObject({
      accountCurrencyCode: 840,
      amountUah: -10_000,
      fxRate: null,
    });
    expect(byId.get("stub_op")).toMatchObject({
      accountCurrencyCode: 0,
      amountUah: null,
      fxRate: null,
    });
    expect(byId.get("uah_op")).toMatchObject({
      accountCurrencyCode: 980,
      amountUah: null,
      fxRate: null,
    });

    const { rows } = await testQuery<{
      mono_tx_id: string;
      amount_uah: string | null;
    }>(
      `SELECT mono_tx_id, amount_uah FROM mono_transaction ORDER BY mono_tx_id`,
    );
    expect(
      Object.fromEntries(rows.map((r) => [r.mono_tx_id, r.amount_uah])),
    ).toEqual({
      stub_op: null,
      uah_op: null,
      usd_buy: "-415000",
      usd_card_uah_op: "-10000",
    });
  });

  it("курс НБУ пишеться в кеш раз і не перезаписується", async () => {
    const { getNbuRates } = await import("../fx/nbuRate.js");
    const answer = (rate: number) => async () => ({
      ok: true,
      json: async () => [{ r030: 978, rate }],
    });

    await getNbuRates([{ currencyCode: 978, date: "2026-11-20" }], {
      fetchImpl: answer(44.1),
      today: "2026-11-25",
    });
    // Друга відповідь з іншим курсом: кеш уже має рядок, НБУ не питаємо.
    const second = await getNbuRates(
      [{ currencyCode: 978, date: "2026-11-20" }],
      { fetchImpl: answer(99), today: "2026-11-25" },
    );

    expect(second.get("978:2026-11-20")).toEqual({
      uahPerUnit: 44.1,
      sourceDate: "2026-11-20",
    });
    const { rows } = await testQuery<{ n: string }>(
      `SELECT count(*) AS n FROM nbu_fx_rate`,
    );
    expect(rows[0]!.n).toBe("1");
  });
});
