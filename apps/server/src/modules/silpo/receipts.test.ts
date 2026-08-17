import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  poolConnect: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("./tokenStore.js", () => ({
  callWithFreshAccessToken: mocks.callWithFreshAccessToken,
}));

// Only needed for the `fetchOrderList` per-order-parsing tests below —
// other tests drive `pullAndSyncReceipts` via a fully-mocked
// `callWithFreshAccessToken` that never reaches `callMcpTool`.
vi.mock("./mcpClient.js", () => ({
  callMcpTool: mocks.callMcpTool,
}));

// Only needed for the real-transaction (`defaultWithTransaction`) test
// below — every other test injects an explicit `deps.withTransaction`/
// `deps.query` fake and never touches `../../db.js`.
vi.mock("../../db.js", () => ({
  query: mocks.dbQuery,
  pool: { connect: mocks.poolConnect },
}));

import {
  listReceipts,
  pullAndSyncReceipts,
  silpoErrorToAppError,
  __test__,
  type SilpoTransactionRunner,
} from "./receipts.js";
import type { QueryFn } from "./tokenStore.js";

const { normalizeRawOrder } = __test__;

beforeEach(() => {
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.poolConnect.mockReset();
  mocks.dbQuery.mockReset();
});

// ─────────────────────────── normalizeRawOrder (provisional) ────────────────

describe("normalizeRawOrder (provisional field-alias mapping)", () => {
  it("parses a fully-populated offline order via the primary field names", () => {
    const parsed = normalizeRawOrder(
      {
        id: "r1",
        purchasedAt: "2026-08-10T12:00:00.000Z",
        storeId: "store-9",
        paymentHint: "card *1234",
        totalKop: 12345,
        items: [
          {
            name: "Молоко",
            qty: 1,
            unit: "шт",
            priceKop: 4500,
            categorySlug: "dairy",
          },
        ],
      },
      "offline",
    );

    expect(parsed).toMatchObject({
      receiptId: "r1",
      storeId: "store-9",
      paymentHint: "card *1234",
      totalKop: 12345,
    });
    expect(parsed?.items).toEqual([
      {
        name: "Молоко",
        qty: 1,
        unit: "шт",
        priceKop: 4500,
        categorySlug: "dairy",
        barcode: null,
      },
    ]);
  });

  it("falls back through id/date/total aliases and UAH→kop conversion", () => {
    const parsed = normalizeRawOrder(
      {
        orderId: "r2",
        createdAt: "2026-08-11T08:00:00.000Z",
        store: "Сільпо на Хрещатику",
        total: 99.5, // UAH — should become 9950 kop
      },
      "online",
    );

    expect(parsed).toMatchObject({
      receiptId: "r2",
      storeId: "Сільпо на Хрещатику",
      totalKop: 9950,
    });
  });

  it("drops a receipt with no usable id (never throws)", () => {
    expect(
      normalizeRawOrder(
        { purchasedAt: "2026-08-10T12:00:00.000Z", total: 10 },
        "offline",
      ),
    ).toBeNull();
  });

  it("drops a receipt with no usable date", () => {
    expect(normalizeRawOrder({ id: "r3", total: 10 }, "offline")).toBeNull();
  });

  it("drops a receipt with no usable total", () => {
    expect(
      normalizeRawOrder(
        { id: "r4", purchasedAt: "2026-08-10T12:00:00.000Z" },
        "offline",
      ),
    ).toBeNull();
  });

  it("drops individual items that have no name, but keeps the receipt", () => {
    const parsed = normalizeRawOrder(
      {
        id: "r5",
        purchasedAt: "2026-08-10T12:00:00.000Z",
        total: 10,
        items: [
          { qty: 1, priceKop: 100 },
          { name: "Хліб", priceKop: 2000 },
        ],
      },
      "offline",
    );
    expect(parsed?.items).toEqual([
      {
        name: "Хліб",
        qty: null,
        unit: null,
        priceKop: 2000,
        categorySlug: null,
        barcode: null,
      },
    ]);
  });
});

// ─────────────────────────────── silpoErrorToAppError ───────────────────────

describe("silpoErrorToAppError", () => {
  it.each([
    ["not_connected", 409, "SILPO_NOT_CONNECTED"],
    ["reauth_required", 409, "SILPO_REAUTH_REQUIRED"],
    ["auth_required", 409, "SILPO_REAUTH_REQUIRED"],
    ["config_missing", 503, "SILPO_CONFIG_MISSING"],
    ["rate_limited", 429, "SILPO_RATE_LIMITED"],
    ["schema_drift", 502, "SILPO_SCHEMA_DRIFT"],
    ["upstream_unavailable", 502, "SILPO_UPSTREAM_ERROR"],
    ["protocol_error", 502, "SILPO_UPSTREAM_ERROR"],
  ] as const)("maps %s → status %d / code %s", (kind, status, code) => {
    const err = silpoErrorToAppError({ kind, message: "x" });
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
  });
});

// ─────────────────────────────── pullAndSyncReceipts ─────────────────────────

interface FakeReceiptRow {
  receiptId: string;
  purchasedAt: Date;
  totalKop: number;
}
interface FakeMonoTx {
  id: string;
  amountKop: number;
  time: Date;
  mcc?: number | null;
  description?: string | null;
  receiptId?: string | null;
}

function makeFakeDb(seed: { monoTransactions?: FakeMonoTx[] } = {}) {
  const receipts = new Map<string, FakeReceiptRow>();
  const items: Array<{ receiptId: string; name: string; priceKop: number }> =
    [];
  const links: Array<{ transactionId: string; receiptId: string }> = [];
  const monoTx = seed.monoTransactions ?? [];

  const query = (async (text: string, values: unknown[] = []) => {
    if (text.includes("INSERT INTO silpo_receipts")) {
      const [, receiptId, purchasedAt, , , , totalKop] = values as [
        string,
        string,
        Date,
        string | null,
        string,
        string | null,
        number,
        string,
      ];
      if (receipts.has(receiptId)) return { rows: [], rowCount: 0 };
      receipts.set(receiptId, { receiptId, purchasedAt, totalKop });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("INSERT INTO silpo_receipt_items")) {
      let inserted = 0;
      for (let i = 0; i < values.length; i += 8) {
        const [, receiptId, name, , , priceKop] = values.slice(i, i + 8) as [
          string,
          string,
          string,
          number | null,
          string | null,
          number,
          string | null,
          string | null,
        ];
        items.push({ receiptId, name, priceKop });
        inserted++;
      }
      return { rows: [], rowCount: inserted };
    }
    if (text.includes("r.receipt_id, r.total_kop, r.purchased_at")) {
      const rows = [...receipts.values()]
        .filter((r) => !links.some((l) => l.receiptId === r.receiptId))
        .map((r) => ({
          receipt_id: r.receiptId,
          total_kop: r.totalKop,
          purchased_at: r.purchasedAt,
        }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("FROM mono_transaction t")) {
      const [, windowStart, windowEnd] = values as [string, Date, Date];
      const rows = monoTx
        .filter(
          (t) =>
            !links.some((l) => l.transactionId === t.id) &&
            t.time >= windowStart &&
            t.time <= windowEnd,
        )
        .map((t) => ({
          id: t.id,
          amountKop: t.amountKop,
          timeSeconds: Math.floor(t.time.getTime() / 1000),
          mcc: t.mcc ?? null,
          description: t.description ?? null,
          receiptId: t.receiptId ?? null,
        }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("INSERT INTO finyk_tx_receipt_links")) {
      const [, transactionId, receiptId] = values as [string, string, string];
      if (!links.some((l) => l.transactionId === transactionId)) {
        links.push({ transactionId, receiptId });
      }
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake db: unhandled query: ${text}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as QueryFn;

  // Faithful-enough transaction fake for `upsertReceipt`: snapshots
  // `receipts`/`items` before running `fn`, restores them on throw. `query`
  // above mutates those in place synchronously, so this gives real
  // rollback semantics without a real Postgres connection.
  const withTransaction: SilpoTransactionRunner = async (fn) => {
    const receiptsSnapshot = new Map(receipts);
    const itemsSnapshot = [...items];
    try {
      return await fn(query);
    } catch (err) {
      receipts.clear();
      for (const [k, v] of receiptsSnapshot) receipts.set(k, v);
      items.length = 0;
      items.push(...itemsSnapshot);
      throw err;
    }
  };

  return { query, withTransaction, receipts, items, links };
}

const OFFLINE_ORDER = {
  id: "r1",
  purchasedAt: "2026-08-10T12:00:00.000Z",
  totalKop: 5000,
  items: [
    { name: "Хліб", priceKop: 3000 },
    { name: "Молоко", priceKop: 2000 },
  ],
};

describe("pullAndSyncReceipts", () => {
  it("upserts receipts + items and links an unambiguous mono transaction match", async () => {
    const db = makeFakeDb({
      monoTransactions: [
        {
          id: "mono-1",
          amountKop: -5000,
          time: new Date("2026-08-10T12:05:00.000Z"),
          mcc: 5411,
        },
      ],
    });
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: true,
      data: { offline: [OFFLINE_ORDER], online: [] },
    });

    const result = await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });

    expect(result).toMatchObject({
      status: "connected",
      offlinePulled: 1,
      onlinePulled: 0,
      receiptsInserted: 1,
      itemsInserted: 2,
      matched: 1,
      ambiguous: 0,
      unmatched: 0,
    });
    expect(db.receipts.has("r1")).toBe(true);
    expect(db.items).toHaveLength(2);
    expect(db.links).toEqual([{ transactionId: "mono-1", receiptId: "r1" }]);
  });

  it("is idempotent — a second sync with the same data inserts nothing new", async () => {
    const db = makeFakeDb();
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: true,
      data: { offline: [OFFLINE_ORDER], online: [] },
    });

    await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });
    const second = await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });

    expect(second).toMatchObject({ receiptsInserted: 0, itemsInserted: 0 });
    expect(db.items).toHaveLength(2); // still just the first sync's items
  });

  it("leaves a receipt unmatched (first-class state) when no mono transaction candidate exists", async () => {
    const db = makeFakeDb({ monoTransactions: [] });
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: true,
      data: { offline: [OFFLINE_ORDER], online: [] },
    });

    const result = await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });

    expect(result).toMatchObject({ matched: 0, unmatched: 1, ambiguous: 0 });
    expect(db.links).toEqual([]);
  });

  it("throws a mapped AppError instead of a raw error when not connected", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "not_connected", message: "Silpo is not connected" },
    });
    const db = makeFakeDb();

    await expect(
      pullAndSyncReceipts("user-1", { query: db.query }),
    ).rejects.toMatchObject({ status: 409, code: "SILPO_NOT_CONNECTED" });
  });
});

// ─────────────── Finding #1: per-order parsing, not array-level ─────────────

describe("fetchOrderList (per-order parsing via callMcpTool envelope)", () => {
  it("drops one unparseable order (numeric id) and keeps syncing the rest of the list instead of failing the whole sync", async () => {
    const db = makeFakeDb();
    // `callWithFreshAccessToken` actually invokes the passed `fn`
    // (`fetchBothOrderLists`) here — unlike the other `pullAndSyncReceipts`
    // tests above, which mock the whole token/MCP round-trip away, THIS
    // test needs the real `fetchOrderList` → `callMcpTool` path to exercise
    // the per-order `safeParse` fix.
    mocks.callWithFreshAccessToken.mockImplementation(
      async (_userId: string, fn: (token: string) => Promise<unknown>) =>
        fn("fake-access-token"),
    );
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => {
        if (toolName === "silpo_get_my_offline_orders") {
          return {
            ok: true,
            data: [
              {
                id: "r1",
                purchasedAt: "2026-08-10T12:00:00.000Z",
                totalKop: 5000,
              },
              // Malformed: `id` must be a string per `RawOrderSchema` — a
              // real Silpo drift (numeric order id) would have failed the
              // WHOLE array under the old `z.array(RawOrderSchema)`
              // envelope. Now it's dropped + `logger.warn`-ed instead.
              {
                id: 12345,
                purchasedAt: "2026-08-10T12:00:00.000Z",
                totalKop: 5000,
              },
            ],
          };
        }
        return { ok: true, data: [] };
      },
    );

    const result = await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });

    expect(result).toMatchObject({
      status: "connected",
      offlinePulled: 1, // the malformed order never made it past fetchOrderList
      onlinePulled: 0,
      receiptsInserted: 1,
    });
    expect(db.receipts.has("r1")).toBe(true);
    expect(mocks.callMcpTool).toHaveBeenCalledTimes(2); // offline + online
  });
});

// ──────────── Finding #2: receipt + items insert in one transaction ────────

describe("upsertReceipt (receipt + items atomicity)", () => {
  const RECEIPT = {
    receiptId: "r1",
    purchasedAtMs: Date.parse("2026-08-10T12:00:00.000Z"),
    storeId: null,
    paymentHint: null,
    totalKop: 5000,
    items: [
      {
        name: "Хліб",
        qty: null,
        unit: null,
        priceKop: 3000,
        categorySlug: null,
        barcode: null,
      },
    ],
    raw: {},
  };

  it("rolls back the receipt insert (fake in-memory transaction) when the items insert throws", async () => {
    const db = makeFakeDb();
    const originalQuery = db.query;
    const failingQuery: QueryFn = (async (text: string, values?: unknown[]) => {
      if (text.includes("INSERT INTO silpo_receipt_items")) {
        throw new Error("items insert failed");
      }
      return originalQuery(text, values);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const withFailingTransaction: SilpoTransactionRunner = async (fn) => {
      const receiptsSnapshot = new Map(db.receipts);
      try {
        return await fn(failingQuery);
      } catch (err) {
        db.receipts.clear();
        for (const [k, v] of receiptsSnapshot) db.receipts.set(k, v);
        throw err;
      }
    };

    await expect(
      __test__.upsertReceipt(
        "user-1",
        "offline",
        RECEIPT,
        withFailingTransaction,
      ),
    ).rejects.toThrow("items insert failed");

    expect(db.receipts.has("r1")).toBe(false); // rolled back, not left orphaned
  });

  it("real BEGIN…COMMIT/ROLLBACK transaction (mock-sequence): items insert throws → BEGIN+ROLLBACK+release, never COMMIT", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes("INSERT INTO silpo_receipts")) {
          return { rows: [], rowCount: 1 };
        }
        if (text.includes("INSERT INTO silpo_receipt_items")) {
          throw new Error("items insert failed");
        }
        throw new Error(`unexpected query in test: ${text}`);
      }),
      release: vi.fn(),
    };
    mocks.poolConnect.mockResolvedValue(client);

    await expect(
      __test__.upsertReceipt(
        "user-1",
        "offline",
        RECEIPT,
        __test__.defaultWithTransaction,
      ),
    ).rejects.toThrow("items insert failed");

    expect(calls[0]).toBe("BEGIN");
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("listReceipts", () => {
  it("rejects a malformed cursor with a 400 AppError", async () => {
    const db = makeFakeDb();
    await expect(
      listReceipts("user-1", { limit: 10, cursor: "no-colon-here" }, db.query),
    ).rejects.toMatchObject({ status: 400 });
  });
});
