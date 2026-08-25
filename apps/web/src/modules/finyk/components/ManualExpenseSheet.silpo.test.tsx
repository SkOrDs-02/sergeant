/** @vitest-environment jsdom */
/**
 * Секція чека Сільпо всередині ручної витрати.
 *
 * Чому окремий файл, а не рядок у `ManualExpenseSheet.extra.test.tsx`:
 * тут потрібен мок `@shared/api` на весь модуль, а решта тестів
 * ManualExpenseSheet свідомо працює без нього.
 *
 * Що саме гейтиться: витрати, залиті скріном банкінгу, живуть у
 * `finyk_manual_expenses`, і matcher почав їх бачити лише 2026-08-25.
 * Але привʼязати чек мало — його ще треба ПОКАЗАТИ, а редагування
 * ручної витрати відкриває свій sheet, не деталі банківської операції.
 * Без цієї секції чек привʼязувався б у порожнечу.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
      unlinkReceipt: vi.fn(),
      relinkReceipt: vi.fn(),
    },
  };
});

import { silpoApi } from "@shared/api";
import { ManualExpenseSheet } from "./ManualExpenseSheet";

const mockedSyncState = silpoApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;
const mockedDetail = silpoApi.receiptDetail as unknown as ReturnType<
  typeof vi.fn
>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EXPENSE = {
  id: "manual-1",
  description: "Сільпо",
  amount: 747.84,
  category: "food",
  date: "2026-08-24",
  kind: "expense",
};

function renderSheet(overrides: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ManualExpenseSheet
          open
          onClose={() => {}}
          onSave={() => {}}
          initialExpense={EXPENSE}
          onSplitChange={() => {}}
          {...overrides}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { client };
}

describe("ManualExpenseSheet — чек Сільпо", () => {
  it("показує позиції привʼязаного чека", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: null,
      lastSyncAt: "2026-08-25T09:00:00.000Z",
      receiptsCount: 6,
    });
    const summary = {
      receiptId: "r-24",
      purchasedAt: "2026-08-24T18:09:00.000Z",
      storeId: null,
      channel: "offline" as const,
      paymentHint: null,
      totalKop: 74_784,
      transactionId: "manual-1",
    };
    mockedReceipts.mockResolvedValue({ data: [summary], nextCursor: null });
    mockedDetail.mockResolvedValue({
      ...summary,
      items: [
        {
          id: 1,
          name: "Молоко",
          qty: 1,
          unit: "шт",
          priceKop: 74_784,
          categorySlug: null,
          barcode: null,
        },
      ],
    });

    renderSheet();

    expect(await screen.findByText("Чек із Сільпо")).toBeInTheDocument();
    expect(await screen.findByText("Молоко")).toBeInTheDocument();
  });

  it("без чека пропонує прикріпити його вручну", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 6,
    });
    mockedReceipts.mockResolvedValue({ data: [], nextCursor: null });

    renderSheet();

    expect(
      await screen.findByRole("button", { name: "Прикріпити чек" }),
    ).toBeInTheDocument();
  });

  it("без `onSplitChange` секції немає — Сільпо не запитується взагалі", async () => {
    // Це не косметика: `SilpoUnmatchedReceipts` відкриває той самий sheet
    // для СТВОРЕННЯ витрати з чека, і тягнути там стан інтеграції заради
    // секції, яку нема куди причепити, — зайвий мережевий виклик.
    renderSheet({ onSplitChange: undefined });

    await waitFor(() =>
      expect(screen.getByText("Редагувати витрату")).toBeInTheDocument(),
    );
    expect(mockedSyncState).not.toHaveBeenCalled();
  });
});
