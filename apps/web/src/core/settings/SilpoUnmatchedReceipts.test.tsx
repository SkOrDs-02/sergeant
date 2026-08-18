// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { SilpoUnmatchedReceipts } from "./SilpoUnmatchedReceipts";

const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;

const UNMATCHED_RECEIPT = {
  receiptId: "u1",
  purchasedAt: "2026-08-15T12:00:00.000Z",
  storeId: null,
  channel: "offline" as const,
  paymentHint: null,
  totalKop: 15_050,
  transactionId: null,
};

const MATCHED_RECEIPT = {
  receiptId: "u2",
  purchasedAt: "2026-08-14T09:00:00.000Z",
  storeId: null,
  channel: "offline" as const,
  paymentHint: null,
  totalKop: 5_000,
  transactionId: "tx-9",
};

beforeAll(() => {
  // ManualExpenseSheet's onSave path pings hapticSuccess() → navigator.vibrate.
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});

function renderList(addManualExpense = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <SilpoUnmatchedReceipts enabled addManualExpense={addManualExpense} />
    </QueryClientProvider>,
  );
  return { ...utils, addManualExpense };
}

afterEach(cleanup);

describe("SilpoUnmatchedReceipts", () => {
  it("renders nothing when every receipt already has a transaction", async () => {
    mockedReceipts.mockResolvedValue({
      data: [MATCHED_RECEIPT],
      nextCursor: null,
    });
    const { container } = renderList();
    await waitFor(() => expect(mockedReceipts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unmatched count and, on expand, per-receipt CTAs", async () => {
    mockedReceipts.mockResolvedValue({
      data: [UNMATCHED_RECEIPT, MATCHED_RECEIPT],
      nextCursor: null,
    });
    renderList();

    expect(await screen.findByText("Чеки без транзакції")).toBeInTheDocument();
    expect(screen.getByText(/1\s+без транзакції/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Чеки без транзакції"));
    expect(
      screen.getByRole("button", { name: "Створити витрату" }),
    ).toBeInTheDocument();
    // The matched receipt never gets a row.
    expect(
      screen.getAllByRole("button", { name: "Створити витрату" }),
    ).toHaveLength(1);
  });

  it("opens ManualExpenseSheet prefilled from the receipt and writes through addManualExpense on save", async () => {
    mockedReceipts.mockResolvedValue({
      data: [UNMATCHED_RECEIPT],
      nextCursor: null,
    });
    const { addManualExpense } = renderList();

    fireEvent.click(await screen.findByText("Чеки без транзакції"));
    fireEvent.click(screen.getByRole("button", { name: "Створити витрату" }));

    const amountInput = await screen.findByLabelText("Сума ₴");
    expect(amountInput).toHaveValue("150.5");
    const descInput = screen.getByLabelText(/Назва/);
    expect(descInput).toHaveValue("Чек Сільпо u1");

    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => expect(addManualExpense).toHaveBeenCalledTimes(1));
    const [draft] = addManualExpense.mock.calls[0] as [
      { description: string; amount: number; category: string; kind: string },
    ];
    expect(draft.description).toBe("Чек Сільпо u1");
    expect(draft.amount).toBe(150.5);
    expect(draft.category).toBe("food");
    expect(draft.kind).toBe("expense");

    // Sheet closes after save — its "Скасувати" footer button disappears.
    expect(
      screen.queryByRole("button", { name: "Скасувати" }),
    ).not.toBeInTheDocument();
  });
});
