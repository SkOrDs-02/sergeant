// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@sergeant/api-client";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
  };
});

import { silpoApi } from "@shared/api";
import {
  useSilpoReceipts,
  useSilpoReceiptDetail,
  useSilpoReceiptForTransaction,
} from "./useSilpoReceipts";

const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;
const mockedReceiptDetail = silpoApi.receiptDetail as unknown as ReturnType<
  typeof vi.fn
>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const SUMMARY_MATCHED = {
  receiptId: "rcpt-1",
  purchasedAt: "2026-08-16T18:20:00.000Z",
  storeId: "store-042",
  channel: "offline" as const,
  paymentHint: "card",
  totalKop: 45690,
  transactionId: "tx-1",
};

const SUMMARY_UNMATCHED = {
  ...SUMMARY_MATCHED,
  receiptId: "rcpt-2",
  transactionId: null,
};

describe("useSilpoReceipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the receipts page data", async () => {
    mockedReceipts.mockResolvedValue({
      data: [SUMMARY_MATCHED],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSilpoReceipts(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.receipts).toEqual([SUMMARY_MATCHED]);
  });

  it("does not fetch when enabled is false", () => {
    renderHook(() => useSilpoReceipts(undefined, { enabled: false }), {
      wrapper: makeWrapper(),
    });
    expect(mockedReceipts).not.toHaveBeenCalled();
  });
});

describe("useSilpoReceiptDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns receipt detail data when found", async () => {
    mockedReceiptDetail.mockResolvedValue({
      ...SUMMARY_MATCHED,
      items: [
        {
          id: 1,
          name: "Молоко",
          qty: 1,
          unit: "шт",
          priceKop: 4500,
          categorySlug: "dairy",
          barcode: null,
        },
      ],
    });

    const { result } = renderHook(() => useSilpoReceiptDetail("rcpt-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.notFound).toBe(false);
  });

  it("surfaces a 404 as notFound instead of an error banner", async () => {
    mockedReceiptDetail.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "Not found",
        status: 404,
        body: { code: "NOT_FOUND" },
        url: "/api/silpo/receipts/rcpt-missing",
      }),
    );

    const { result } = renderHook(() => useSilpoReceiptDetail("rcpt-missing"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when receiptId is null", () => {
    renderHook(() => useSilpoReceiptDetail(null), {
      wrapper: makeWrapper(),
    });
    expect(mockedReceiptDetail).not.toHaveBeenCalled();
  });
});

describe("useSilpoReceiptForTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds the summary matching transactionId and loads its detail", async () => {
    mockedReceipts.mockResolvedValue({
      data: [SUMMARY_UNMATCHED, SUMMARY_MATCHED],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...SUMMARY_MATCHED,
      items: [
        {
          id: 1,
          name: "Хліб",
          qty: null,
          unit: null,
          priceKop: 3000,
          categorySlug: null,
          barcode: null,
        },
      ],
    });

    const { result } = renderHook(() => useSilpoReceiptForTransaction("tx-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary?.receiptId).toBe("rcpt-1");
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(mockedReceiptDetail).toHaveBeenCalledWith(
      "rcpt-1",
      expect.anything(),
    );
  });

  it("returns null summary when no receipt links to the transaction", async () => {
    mockedReceipts.mockResolvedValue({
      data: [SUMMARY_UNMATCHED],
      nextCursor: null,
    });

    const { result } = renderHook(
      () => useSilpoReceiptForTransaction("tx-does-not-exist"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(mockedReceiptDetail).not.toHaveBeenCalled();
  });

  it("does not fetch the receipts list when disabled", () => {
    renderHook(
      () => useSilpoReceiptForTransaction("tx-1", { enabled: false }),
      { wrapper: makeWrapper() },
    );
    expect(mockedReceipts).not.toHaveBeenCalled();
  });
});
