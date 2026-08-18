import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  resolveBranchContext: vi.fn(),
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

vi.mock("./branchContext.js", () => ({
  resolveBranchContext: mocks.resolveBranchContext,
}));

// Only needed for the real-transaction (`defaultWithTransaction`) test
// below — every other test injects an explicit `deps.withTransaction`/
// `deps.query` fake and never touches `../../db.js`.
vi.mock("../../db.js", () => ({
  query: mocks.dbQuery,
  pool: { connect: mocks.poolConnect },
}));

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/node";
import {
  listReceipts,
  pullAndSyncReceipts,
  silpoErrorToAppError,
  __resetSilpoSchemaDriftAlert,
  __test__,
  type SilpoTransactionRunner,
} from "./receipts.js";
import type { QueryFn } from "./tokenStore.js";

const { normalizeRawOrder } = __test__;

beforeEach(() => {
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.resolveBranchContext.mockReset();
  mocks.poolConnect.mockReset();
  mocks.dbQuery.mockReset();
});

// ─────────────── normalizeRawOrder (форми зі спайку §0, 2026-08-18) ─────────
// Усі назви/суми/ID у фікстурах вигадані — реальні дані покупок у git не
// потрапляють (форми полів звірені з живим капчуром, значення — ні).

describe("normalizeRawOrder (живі форми Silpo MCP)", () => {
  it("offline: id з receiptUrl-токена, наївна Kyiv-дата, sumReg→kop, unit-price items", () => {
    const parsed = normalizeRawOrder(
      {
        filId: 999,
        filialName: "Сільпо, м. Тестове",
        createdAt: "2026-08-10T15:00:00", // наївний Kyiv-local (без офсету)
        sumReg: 123.45,
        receiptUrl: "https://receipt.silpo.elkasa.com.ua/AbCdTest01",
        products: [
          {
            lagerId: 111111,
            name: "Тестове молоко 2.6% 900г",
            unit: "шт",
            quantity: 2,
            price: 45.5, // UAH за одиницю
          },
        ],
      },
      "offline",
    );

    expect(parsed).toMatchObject({
      receiptId: "AbCdTest01",
      storeId: "999",
      paymentHint: null,
      totalKop: 12345,
    });
    // Серпень → Kyiv = UTC+3: 15:00 Kyiv = 12:00Z, незалежно від TZ процесу.
    expect(parsed?.purchasedAtMs).toBe(Date.parse("2026-08-10T15:00:00+03:00"));
    expect(parsed?.items).toEqual([
      {
        name: "Тестове молоко 2.6% 900г",
        qty: 2,
        unit: "шт",
        priceKop: 4550,
        categorySlug: null,
        barcode: null,
      },
    ]);
  });

  it("offline без receiptUrl: детермінований fallback-id filId+createdAt", () => {
    const parsed = normalizeRawOrder(
      {
        filId: 42,
        createdAt: "2026-01-15T10:00:00",
        sumReg: 10,
        receiptUrl: null,
      },
      "offline",
    );
    expect(parsed?.receiptId).toBe("offline_42_2026-01-15T10:00:00");
    // Січень → Kyiv = UTC+2.
    expect(parsed?.purchasedAtMs).toBe(Date.parse("2026-01-15T10:00:00+02:00"));
  });

  it("online: orderId, ISO-дата з офсетом, amount→kop, items з products", () => {
    const parsed = normalizeRawOrder(
      {
        orderId: "test-uuid-1",
        status: "received",
        createdAt: "2026-08-11T08:00:00+00:00",
        amount: 99.5, // UAH → 9950 kop
        products: [
          {
            id: "cat-uuid-1",
            name: "Тестовий хліб",
            price: 40,
            quantity: 1,
            subtotal: 40,
          },
        ],
      },
      "online",
    );

    expect(parsed).toMatchObject({
      receiptId: "test-uuid-1",
      storeId: null,
      totalKop: 9950,
    });
    expect(parsed?.purchasedAtMs).toBe(Date.parse("2026-08-11T08:00:00+00:00"));
    expect(parsed?.items).toEqual([
      {
        name: "Тестовий хліб",
        qty: 1,
        unit: null,
        priceKop: 4000,
        categorySlug: null,
        barcode: null,
      },
    ]);
  });

  it("drops a receipt with no usable id (never throws)", () => {
    expect(
      normalizeRawOrder(
        { createdAt: "2026-08-10T12:00:00", sumReg: 10 },
        "offline",
      ),
    ).toBeNull();
  });

  it("drops a receipt with no usable date", () => {
    expect(
      normalizeRawOrder(
        { receiptUrl: "https://receipt.silpo.elkasa.com.ua/x1", sumReg: 10 },
        "offline",
      ),
    ).toBeNull();
  });

  it("drops a receipt with no usable total", () => {
    expect(
      normalizeRawOrder(
        {
          receiptUrl: "https://receipt.silpo.elkasa.com.ua/x2",
          createdAt: "2026-08-10T12:00:00",
        },
        "offline",
      ),
    ).toBeNull();
  });

  it("drops individual items that have no name, but keeps the receipt", () => {
    const parsed = normalizeRawOrder(
      {
        receiptUrl: "https://receipt.silpo.elkasa.com.ua/x3",
        createdAt: "2026-08-10T12:00:00",
        sumReg: 10,
        products: [
          { quantity: 1, price: 1 },
          { name: "Хліб", price: 20 },
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
    if (text.includes("UPDATE silpo_connection")) {
      // last_sync_at touch наприкінці успішного pullAndSyncReceipts.
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

// Вигадані дані у формі живого silpo_get_my_offline_orders (спайк §0).
const OFFLINE_ORDER = {
  filId: 777,
  filialName: "Сільпо, м. Тестове",
  createdAt: "2026-08-10T15:00:00", // Kyiv-local = 12:00Z у серпні
  sumReg: 50,
  receiptUrl: "https://receipt.silpo.elkasa.com.ua/r1token",
  products: [
    { lagerId: 1, name: "Хліб", unit: "шт", quantity: 1, price: 30 },
    { lagerId: 2, name: "Молоко", unit: "шт", quantity: 1, price: 20 },
  ],
};
const OFFLINE_ORDER_RECEIPT_ID = "r1token";

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
    expect(db.receipts.has(OFFLINE_ORDER_RECEIPT_ID)).toBe(true);
    expect(db.items).toHaveLength(2);
    expect(db.links).toEqual([
      { transactionId: "mono-1", receiptId: OFFLINE_ORDER_RECEIPT_ID },
    ]);
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
  const BRANCH_CTX = {
    ok: true as const,
    data: {
      branchId: "branch-uuid-1",
      deliveryType: "SelfPickup",
      timeslotStart: "",
      timeslotEnd: "",
    },
  };

  it("drops one unparseable order and keeps syncing the rest of the list instead of failing the whole sync", async () => {
    const db = makeFakeDb();
    // `callWithFreshAccessToken` actually invokes the passed `fn`
    // (`makeFetchBothOrderLists`) here — unlike the other
    // `pullAndSyncReceipts` tests above, which mock the whole token/MCP
    // round-trip away, THIS test needs the real `fetchOrderList` →
    // `callMcpTool` path to exercise the per-order `safeParse` fix.
    mocks.callWithFreshAccessToken.mockImplementation(
      async (_userId: string, fn: (token: string) => Promise<unknown>) =>
        fn("fake-access-token"),
    );
    mocks.resolveBranchContext.mockResolvedValue(BRANCH_CTX);
    mocks.callMcpTool.mockImplementation(
      async ({
        toolName,
        args,
      }: {
        toolName: string;
        args: Record<string, unknown>;
      }) => {
        if (toolName === "silpo_get_my_offline_orders") {
          // Контекст філії має долітати до самого tool-виклику.
          expect(args["branchId"]).toBe("branch-uuid-1");
          expect(args["deliveryType"]).toBe("SelfPickup");
          return {
            ok: true,
            data: {
              success: true,
              orders: [
                OFFLINE_ORDER,
                // Malformed: `createdAt` мусить бути рядком per
                // `RawOrderSchema` — реальний дрейф Сільпо валив би ВЕСЬ
                // масив під старим array-level envelope. Тепер він
                // DROP-ається + `logger.warn`-иться.
                { ...OFFLINE_ORDER, receiptUrl: null, createdAt: 12345 },
              ],
            },
          };
        }
        return { ok: true, data: { success: true, orders: [] } };
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
    expect(db.receipts.has(OFFLINE_ORDER_RECEIPT_ID)).toBe(true);
    expect(mocks.callMcpTool).toHaveBeenCalledTimes(2); // offline + online
  });

  it("деградує offline-канал (порожній список + warn), коли контекст філії недоступний — online синкається далі", async () => {
    const db = makeFakeDb();
    mocks.callWithFreshAccessToken.mockImplementation(
      async (_userId: string, fn: (token: string) => Promise<unknown>) =>
        fn("fake-access-token"),
    );
    mocks.resolveBranchContext.mockResolvedValue({
      ok: false,
      error: { kind: "schema_drift", message: "no branch context" },
    });
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => {
        expect(toolName).toBe("silpo_get_my_online_orders");
        return {
          ok: true,
          data: {
            success: true,
            orders: [
              {
                orderId: "online-1",
                createdAt: "2026-08-11T08:00:00+00:00",
                amount: 10,
              },
            ],
          },
        };
      },
    );

    const result = await pullAndSyncReceipts("user-1", {
      query: db.query,
      withTransaction: db.withTransaction,
    });

    expect(result).toMatchObject({
      offlinePulled: 0,
      onlinePulled: 1,
      receiptsInserted: 1,
    });
    expect(mocks.callMcpTool).toHaveBeenCalledTimes(1); // лише online
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

  it("nextCursor — opaque base64url, декодований назад приймається без 400", async () => {
    const summaryRow = (n: number) => ({
      receiptId: `r:${n}`, // receipt_id із двокрапкою — саме та колізія, від якої рятує base64url
      purchasedAt: new Date("2026-08-10T12:00:00.000Z"),
      storeId: null,
      channel: "offline" as const,
      paymentHint: null,
      totalKop: 1000,
      transactionId: null,
    });
    const capturedParams: unknown[][] = [];
    const query = (async (_text: string, values: unknown[] = []) => {
      capturedParams.push(values);
      return { rows: [summaryRow(1), summaryRow(2)], rowCount: 2 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as QueryFn;

    const page1 = await listReceipts("user-1", { limit: 1 }, query);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.nextCursor).not.toContain(":"); // opaque, не сирий формат

    const decoded = Buffer.from(page1.nextCursor ?? "", "base64url").toString(
      "utf8",
    );
    expect(JSON.parse(decoded)).toEqual(["2026-08-10T12:00:00.000Z", "r:1"]);

    await listReceipts(
      "user-1",
      { limit: 1, cursor: page1.nextCursor ?? undefined },
      query,
    );
    // Декодований курсор розібрано за ОСТАННЬОЮ двокрапкою: receipt_id "r:1" цілий.
    expect(capturedParams[1]).toEqual([
      "user-1",
      "2026-08-10T12:00:00.000Z",
      "r:1",
      2,
    ]);
  });
});

// ─── Sentry-алерт на дрейф схеми ────────────────────────────────────────────
//
// Дрейф контракту Сільпо — єдина відмова, про яку ніхто не дізнається сам:
// версіонування в них немає, а `errorHandler` шле в Sentry лише
// НЕ-operational 5xx (наш `SILPO_SCHEMA_DRIFT` — operational `AppError`).
// Тому capture викликається явно в мапері; тут перевіряємо і сам виклик,
// і дедуп-вікно (дрейф — стан, а не подія: без вікна кожен тап «Оновити
// чеки» кожного юзера створював би окрему подію).
describe("silpoErrorToAppError → Sentry на schema_drift", () => {
  beforeEach(() => {
    __resetSilpoSchemaDriftAlert();
    vi.clearAllMocks();
  });

  it("шле подію в Sentry на дрейф схеми", () => {
    const err = silpoErrorToAppError({
      kind: "schema_drift",
      message: "orders[0].createdAt відсутнє",
    });
    expect(err.code).toBe("SILPO_SCHEMA_DRIFT");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, opts] = vi.mocked(Sentry.captureException).mock.calls[0]!;
    expect((captured as Error).message).toContain("orders[0].createdAt");
    expect(opts).toMatchObject({
      tags: { integration: "silpo", kind: "schema_drift" },
    });
  });

  it("дедупає повторний дрейф у межах вікна", () => {
    silpoErrorToAppError({ kind: "schema_drift", message: "перший" });
    silpoErrorToAppError({ kind: "schema_drift", message: "другий" });
    silpoErrorToAppError({ kind: "schema_drift", message: "третій" });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("не шле подію на інші види помилок", () => {
    silpoErrorToAppError({ kind: "rate_limited", message: "429" });
    silpoErrorToAppError({ kind: "upstream_unavailable", message: "503" });
    silpoErrorToAppError({ kind: "not_connected", message: "no row" });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
