import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    monoWebhookApi: {
      ...actual.monoWebhookApi,
      transactions: vi.fn(),
    },
  };
});

import { monoWebhookApi, type MonoTransactionDto } from "@shared/api";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";

const mockedTransactions = monoWebhookApi.transactions as unknown as ReturnType<
  typeof vi.fn
>;

function tx(
  id: string,
  overrides: Partial<MonoTransactionDto> = {},
): MonoTransactionDto {
  return {
    userId: "u1",
    monoAccountId: "acc1",
    monoTxId: id,
    time: "2025-01-15T12:00:00Z",
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
    receivedAt: "2025-01-15T12:00:01Z",
    ...overrides,
  };
}

describe("fetchAllMonoTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns single page when nextCursor is null", async () => {
    mockedTransactions.mockResolvedValueOnce({
      data: [tx("t1"), tx("t2")],
      nextCursor: null,
    });

    const result = await fetchAllMonoTransactions({
      from: "2025-01-01",
      to: "2025-01-31",
    });

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.monoTxId)).toEqual(["t1", "t2"]);
    expect(mockedTransactions).toHaveBeenCalledTimes(1);
    expect(mockedTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, cursor: undefined }),
      expect.anything(),
    );
  });

  it("follows cursor through multiple pages and concatenates results", async () => {
    mockedTransactions
      .mockResolvedValueOnce({
        data: [tx("t1"), tx("t2")],
        nextCursor: "2025-01-15T11:00:00Z:t2",
      })
      .mockResolvedValueOnce({
        data: [tx("t3"), tx("t4")],
        nextCursor: "2025-01-15T10:00:00Z:t4",
      })
      .mockResolvedValueOnce({
        data: [tx("t5")],
        nextCursor: null,
      });

    const result = await fetchAllMonoTransactions({});

    expect(result).toHaveLength(5);
    expect(result.map((t) => t.monoTxId)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(mockedTransactions).toHaveBeenCalledTimes(3);
    expect(mockedTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "2025-01-15T11:00:00Z:t2" }),
      expect.anything(),
    );
  });

  it("returns [] when first page has no items", async () => {
    mockedTransactions.mockResolvedValueOnce({ data: [], nextCursor: null });

    const result = await fetchAllMonoTransactions({});
    expect(result).toEqual([]);
  });

  it("propagates errors from monoWebhookApi.transactions", async () => {
    mockedTransactions.mockRejectedValueOnce(new Error("boom"));
    await expect(fetchAllMonoTransactions({})).rejects.toThrow("boom");
  });

  it("stops at MAX_PAGES (50) safety cap if server keeps returning a cursor", async () => {
    mockedTransactions.mockResolvedValue({
      data: [tx("loop")],
      nextCursor: "infinite",
    });

    const result = await fetchAllMonoTransactions({});
    expect(result.length).toBe(50);
    expect(mockedTransactions).toHaveBeenCalledTimes(50);
  });
});
