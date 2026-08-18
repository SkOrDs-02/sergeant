// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
import { SilpoReceiptSection } from "./SilpoReceiptSection";

const mockedSyncState = silpoApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;
const mockedReceiptDetail = silpoApi.receiptDetail as unknown as ReturnType<
  typeof vi.fn
>;

const RECEIPT_SUMMARY = {
  receiptId: "r1",
  purchasedAt: "2026-08-10T10:00:00.000Z",
  storeId: null,
  channel: "offline" as const,
  paymentHint: null,
  totalKop: 39_000,
  transactionId: "bank-1",
};

/** Same fixture amounts as `receiptSplitSuggestion.test.ts` (domain suite)
 * — `shopping` 20 000, `groceries` 14 000 (Хліб+Сир), `health` 5 000, no
 * remainder against `totalKop`. */
const MULTI_CATEGORY_ITEMS = [
  {
    id: 1,
    name: "Хліб",
    qty: 1,
    unit: null,
    priceKop: 2_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 2,
    name: "Сир",
    qty: 1,
    unit: null,
    priceKop: 12_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 3,
    name: "Пральний порошок Persil",
    qty: 1,
    unit: null,
    priceKop: 20_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 4,
    name: "Зубна паста Sensodyne",
    qty: 1,
    unit: null,
    priceKop: 5_000,
    categorySlug: null,
    barcode: null,
  },
];

const SINGLE_CATEGORY_ITEMS = [
  {
    id: 1,
    name: "Хліб",
    qty: 1,
    unit: null,
    priceKop: 1_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 2,
    name: "Яйця",
    qty: 1,
    unit: null,
    priceKop: 2_000,
    categorySlug: null,
    barcode: null,
  },
];

function renderSection(
  overrides: Partial<Parameters<typeof SilpoReceiptSection>[0]> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onSplitChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <SilpoReceiptSection
        transactionId="bank-1"
        onSplitChange={onSplitChange}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSplitChange };
}

afterEach(cleanup);

describe("SilpoReceiptSection", () => {
  it("renders nothing when Silpo isn't connected", () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("proposes a multi-category split from receipt items and confirms it via onSplitChange", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    const { onSplitChange } = renderSection();

    const splitCta = await screen.findByRole("button", {
      name: /Розбити за чеком/,
    });
    expect(splitCta).toBeEnabled();
    fireEvent.click(splitCta);

    // Category chips resolved through `resolveExpenseCategoryMeta` after
    // canonicalization: "groceries" → "food" ("Продукти"), plus "health"
    // ("Здоров'я") and "shopping" ("Покупки").
    expect(await screen.findByText("Продукти")).toBeInTheDocument();
    expect(screen.getByText("Здоров'я")).toBeInTheDocument();
    expect(screen.getByText("Покупки")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Підтвердити спліт" }));

    expect(onSplitChange).toHaveBeenCalledTimes(1);
    const [txId, splits] = onSplitChange.mock.calls[0] as [
      string,
      Array<{ categoryId: string; amount: number }>,
    ];
    expect(txId).toBe("bank-1");
    expect(splits).toEqual(
      expect.arrayContaining([
        { categoryId: "shopping", amount: 200 },
        { categoryId: "food", amount: 140 },
        { categoryId: "health", amount: 50 },
      ]),
    );
    expect(splits).toHaveLength(3);
  });

  it("warns before overwriting an existing manual split", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    renderSection({ existingSplitsCount: 2 });

    fireEvent.click(
      await screen.findByRole("button", { name: /Розбити за чеком/ }),
    );

    expect(
      screen.getByText(
        "У транзакції вже є ручний спліт — підтвердження замінить його.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the split CTA and shows a caption when every item lands in one category", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      totalKop: 3_000,
      items: SINGLE_CATEGORY_ITEMS,
    });

    renderSection();

    const splitCta = await screen.findByRole("button", {
      name: /Розбити за чеком/,
    });
    expect(splitCta).toBeDisabled();
    expect(
      screen.getByText("Усе — продукти, спліт не потрібен."),
    ).toBeInTheDocument();
  });
});
