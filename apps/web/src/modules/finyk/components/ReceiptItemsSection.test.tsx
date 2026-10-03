// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@shared/api";
import type { ReceiptGetResponse } from "@sergeant/api-client";

const getReceiptMock = vi.fn();
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      finyk: {
        ...actual.apiClient.finyk,
        getReceipt: (...args: unknown[]) => getReceiptMock(...args),
      },
    },
  };
});

import { ReceiptItemsSection } from "./ReceiptItemsSection";

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

function response(
  overrides: Partial<ReceiptGetResponse["receipt"]> = {},
): ReceiptGetResponse {
  return {
    receipt: {
      id: 1,
      source: "dps",
      fiscalNum: "4000123456",
      store: "Сільпо",
      storeTaxId: null,
      purchasedAt: "2026-08-17T10:00:00.000Z",
      totalKopiykas: 15075,
      items: [
        {
          id: 1,
          receiptId: 1,
          position: 1,
          name: "Хліб",
          qty: 2,
          priceKopiykas: 3000,
          sumKopiykas: 6000,
        },
        {
          id: 2,
          receiptId: 1,
          position: 2,
          name: "Молоко 1л",
          qty: 1.5,
          priceKopiykas: 6050,
          sumKopiykas: 9075,
        },
      ],
      link: { txKind: "manual", txRef: "expense-1" },
      createdAt: "2026-08-17T10:00:01.000Z",
      updatedAt: "2026-08-17T10:00:01.000Z",
      ...overrides,
    },
  };
}

beforeEach(() => {
  getReceiptMock.mockReset();
});

describe("ReceiptItemsSection", () => {
  it("shows a loading state, then renders every item name/qty/sum", async () => {
    getReceiptMock.mockResolvedValue(response());
    render(<ReceiptItemsSection receiptId={1} />, { wrapper: makeWrapper() });

    expect(screen.getByText(/Завантажую позиції/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Хліб")).toBeInTheDocument());
    expect(screen.getByText("Молоко 1л")).toBeInTheDocument();
    expect(getReceiptMock).toHaveBeenCalledWith(1, expect.anything());
  });

  it("shows the vision confidence badge only for source: vision receipts", async () => {
    getReceiptMock.mockResolvedValue(response({ source: "vision" }));
    render(<ReceiptItemsSection receiptId={1} />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByText(/перевір суми/)).toBeInTheDocument(),
    );
  });

  it("does not show the vision badge for a DPS receipt", async () => {
    getReceiptMock.mockResolvedValue(response({ source: "dps" }));
    render(<ReceiptItemsSection receiptId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByText("Хліб")).toBeInTheDocument());
    expect(screen.queryByText(/перевір суми/)).not.toBeInTheDocument();
  });

  it("shows a fallback message when the receipt has no parsed items", async () => {
    getReceiptMock.mockResolvedValue(response({ items: [] }));
    render(<ReceiptItemsSection receiptId={1} />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByText(/не розпізнано/)).toBeInTheDocument(),
    );
  });

  it("shows a retryable error state with the server's human message", async () => {
    getReceiptMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 404,
        message: "HTTP 404",
        url: "https://api.test/finyk/receipts/1",
        body: { error: "Чек не знайдено." },
      }),
    );
    render(<ReceiptItemsSection receiptId={1} />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByText("Чек не знайдено.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Спробуй ще раз/ }),
    ).toBeInTheDocument();
  });
});
