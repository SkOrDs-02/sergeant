import { describe, expect, it } from "vitest";
import {
  MonoAccountDtoSchema,
  MonoAccountsResponseSchema,
  MonoBackfillResponseSchema,
  MonoConnectResponseSchema,
  MonoConnectionStatusSchema,
  MonoDisconnectResponseSchema,
  MonoSyncStateSchema,
  MonoTransactionDtoSchema,
  MonoTransactionsPageSchema,
} from "./api";

/**
 * Lock the `/api/mono/*` HTTP contract (AGENTS.md Hard Rule #3). Server
 * handlers in `apps/server/src/modules/mono/{connection,read,backfill}`
 * validate every response against these schemas before `res.json()`,
 * and the api-client's `MonoAccountDto` / `MonoTransactionDto` /
 * `MonoSyncState` / `MonoTransactionsPage` / `MonoConnect|Disconnect|
 * BackfillResponse` are `z.infer<>` aliases of the same schemas. Keeping
 * them honest catches drift in tests/CI rather than in production.
 */

const VALID_ACCOUNT = {
  userId: "u1",
  monoAccountId: "acc1",
  sendId: null,
  type: "black",
  currencyCode: 980,
  cashbackType: "UAH",
  maskedPan: ["5375****1234"],
  iban: "UA123",
  balance: 10_000,
  creditLimit: 0,
  lastSeenAt: "2025-01-01T00:00:00.000Z",
};

const VALID_TX = {
  userId: "u1",
  monoAccountId: "acc1",
  monoTxId: "tx1",
  time: "2025-01-15T12:00:00.000Z",
  amount: -1000,
  operationAmount: -1000,
  currencyCode: 980,
  mcc: 5411,
  originalMcc: 5411,
  hold: false,
  description: "ATB",
  comment: null,
  cashbackAmount: null,
  commissionRate: null,
  balance: 100_000,
  receiptId: null,
  invoiceId: null,
  counterEdrpou: null,
  counterIban: null,
  counterName: null,
  categorySlug: "groceries",
  categoryOverridden: false,
  source: "webhook",
  receivedAt: "2025-01-15T12:00:01.000Z",
};

describe("MonoConnectionStatusSchema", () => {
  it("accepts the four documented statuses", () => {
    for (const s of ["pending", "active", "invalid", "disconnected"] as const) {
      expect(MonoConnectionStatusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects ad-hoc strings", () => {
    expect(() => MonoConnectionStatusSchema.parse("connecting")).toThrow();
    expect(() => MonoConnectionStatusSchema.parse("")).toThrow();
  });
});

describe("MonoAccountDtoSchema", () => {
  it("accepts a fully-populated row", () => {
    const parsed = MonoAccountDtoSchema.parse(VALID_ACCOUNT);
    expect(parsed.maskedPan).toEqual(["5375****1234"]);
    expect(parsed.balance).toBe(10_000);
  });

  it("accepts null for optional Monobank fields", () => {
    const parsed = MonoAccountDtoSchema.parse({
      ...VALID_ACCOUNT,
      sendId: null,
      type: null,
      cashbackType: null,
      iban: null,
      balance: null,
      creditLimit: null,
    });
    expect(parsed.balance).toBeNull();
    expect(parsed.creditLimit).toBeNull();
  });

  it("accepts an empty maskedPan array (FOP / no-card accounts)", () => {
    const parsed = MonoAccountDtoSchema.parse({
      ...VALID_ACCOUNT,
      maskedPan: [],
    });
    expect(parsed.maskedPan).toEqual([]);
  });

  it("rejects a stringified bigint balance (Hard Rule #1 contract)", () => {
    // The serializer must coerce bigint→number; a stringified balance is
    // exactly the regression that motivated rule #1.
    expect(() =>
      MonoAccountDtoSchema.parse({ ...VALID_ACCOUNT, balance: "10000" }),
    ).toThrow();
  });

  it("rejects missing lastSeenAt (DB column is NOT NULL)", () => {
    const { lastSeenAt: _ls, ...rest } = VALID_ACCOUNT;
    void _ls;
    expect(() => MonoAccountDtoSchema.parse(rest)).toThrow();
  });
});

describe("MonoAccountsResponseSchema", () => {
  it("accepts an empty array (newly-connected user, no accounts yet)", () => {
    expect(MonoAccountsResponseSchema.parse([])).toEqual([]);
  });

  it("accepts an array of valid accounts", () => {
    const parsed = MonoAccountsResponseSchema.parse([
      VALID_ACCOUNT,
      { ...VALID_ACCOUNT, monoAccountId: "acc2", currencyCode: 840 },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].currencyCode).toBe(840);
  });

  it("rejects when one row is malformed", () => {
    expect(() =>
      MonoAccountsResponseSchema.parse([
        VALID_ACCOUNT,
        { ...VALID_ACCOUNT, balance: "not-a-number" },
      ]),
    ).toThrow();
  });
});

describe("MonoTransactionDtoSchema", () => {
  it("accepts a valid webhook-delivered transaction", () => {
    const parsed = MonoTransactionDtoSchema.parse(VALID_TX);
    expect(parsed.source).toBe("webhook");
    expect(parsed.amount).toBe(-1000);
  });

  it("accepts the 'backfill' source variant", () => {
    const parsed = MonoTransactionDtoSchema.parse({
      ...VALID_TX,
      source: "backfill",
    });
    expect(parsed.source).toBe("backfill");
  });

  it("rejects an unknown source value", () => {
    // The DB-level upsert relies on a finite `source` enum (see
    // `mono_transaction.received_at` CASE); accepting `'manual'` here would
    // silently regress that.
    expect(() =>
      MonoTransactionDtoSchema.parse({ ...VALID_TX, source: "manual" }),
    ).toThrow();
  });

  it("accepts null mcc / hold / categorySlug for jar-to-jar transfers", () => {
    const parsed = MonoTransactionDtoSchema.parse({
      ...VALID_TX,
      mcc: null,
      originalMcc: null,
      hold: null,
      categorySlug: null,
    });
    expect(parsed.mcc).toBeNull();
    expect(parsed.categorySlug).toBeNull();
  });

  it("requires categoryOverridden as a boolean (not undefined)", () => {
    const { categoryOverridden: _co, ...rest } = VALID_TX;
    void _co;
    expect(() => MonoTransactionDtoSchema.parse(rest)).toThrow();
  });
});

describe("MonoTransactionsPageSchema", () => {
  it("accepts an empty page (no transactions in range)", () => {
    expect(
      MonoTransactionsPageSchema.parse({ data: [], nextCursor: null }),
    ).toEqual({ data: [], nextCursor: null });
  });

  it("accepts a page with a non-null cursor for follow-up fetch", () => {
    const parsed = MonoTransactionsPageSchema.parse({
      data: [VALID_TX],
      nextCursor: "2025-01-15T12:00:00.000Z:tx1",
    });
    expect(parsed.nextCursor).toBe("2025-01-15T12:00:00.000Z:tx1");
  });

  it("rejects a page where nextCursor is undefined (must be string|null)", () => {
    // The server explicitly emits `null` (not omits the key) so the
    // discriminator is unambiguous; client code keys on `=== null`.
    expect(() =>
      MonoTransactionsPageSchema.parse({ data: [VALID_TX] }),
    ).toThrow();
  });
});

describe("MonoSyncStateSchema", () => {
  it("accepts the disconnected state for a fresh user", () => {
    expect(
      MonoSyncStateSchema.parse({
        status: "disconnected",
        webhookActive: false,
        lastEventAt: null,
        lastBackfillAt: null,
        accountsCount: 0,
      }).status,
    ).toBe("disconnected");
  });

  it("accepts a connected state with timestamps", () => {
    const parsed = MonoSyncStateSchema.parse({
      status: "active",
      webhookActive: true,
      lastEventAt: "2025-04-01T00:00:00.000Z",
      lastBackfillAt: "2025-03-31T00:00:00.000Z",
      accountsCount: 2,
    });
    expect(parsed.webhookActive).toBe(true);
    expect(parsed.accountsCount).toBe(2);
  });

  it("rejects a negative accountsCount", () => {
    expect(() =>
      MonoSyncStateSchema.parse({
        status: "active",
        webhookActive: true,
        lastEventAt: null,
        lastBackfillAt: null,
        accountsCount: -1,
      }),
    ).toThrow();
  });
});

describe("MonoConnectResponseSchema", () => {
  it("accepts the 'active' literal status", () => {
    const parsed = MonoConnectResponseSchema.parse({
      status: "active",
      accountsCount: 3,
    });
    expect(parsed.status).toBe("active");
  });

  it("rejects any non-'active' status (server only emits 'active')", () => {
    expect(() =>
      MonoConnectResponseSchema.parse({
        status: "pending",
        accountsCount: 0,
      }),
    ).toThrow();
  });
});

describe("MonoDisconnectResponseSchema", () => {
  it("accepts the canonical { ok: true } envelope", () => {
    expect(MonoDisconnectResponseSchema.parse({ ok: true })).toEqual({
      ok: true,
    });
  });

  it("rejects { ok: false } (failures throw, never resolve as ok=false)", () => {
    expect(() => MonoDisconnectResponseSchema.parse({ ok: false })).toThrow();
  });
});

describe("MonoBackfillResponseSchema", () => {
  it("accepts the synchronous 'started' response", () => {
    const parsed = MonoBackfillResponseSchema.parse({
      status: "started",
      accountsCount: 2,
    });
    expect(parsed.status).toBe("started");
  });

  it("rejects any non-'started' status (handler only emits 'started')", () => {
    expect(() =>
      MonoBackfillResponseSchema.parse({
        status: "complete",
        accountsCount: 0,
      }),
    ).toThrow();
  });
});
