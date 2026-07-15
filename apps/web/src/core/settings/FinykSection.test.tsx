// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    monoWebhookApi: {
      syncState: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      backfill: vi.fn(),
      accounts: vi.fn(),
      transactions: vi.fn(),
    },
    privatApi: {
      balanceFinal: vi.fn(),
    },
    billingApi: {
      status: vi.fn(),
      createCheckout: vi.fn(),
      createPortal: vi.fn(),
    },
    isApiError: actual.isApiError,
  };
});

vi.mock("../../modules/finyk/hooks/useStorage", () => ({
  useStorage: () => ({
    hiddenAccounts: [],
    toggleHideAccount: vi.fn(),
    customCategories: [],
    addCustomCategory: vi.fn(),
    removeCustomCategory: vi.fn(),
  }),
}));

vi.mock("../../modules/finyk/utils", () => ({
  getAccountLabel: (acc: { id: string }) => `Account ${acc.id}`,
}));

import { billingApi, monoWebhookApi } from "@shared/api";
import { FinykSection } from "./FinykSection";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedConnect = monoWebhookApi.connect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedBillingStatus = billingApi.status as unknown as ReturnType<
  typeof vi.fn
>;

function renderWithProviders() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FinykSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FinykSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBillingStatus.mockResolvedValue({
      subscription: {
        id: 42,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-06-01T10:00:00.000Z",
      },
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders webhook connect form when disconnected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/Токен відправляється на сервер/)).toBeTruthy();
    });
    expect(screen.getByPlaceholderText("Токен Monobank API")).toBeTruthy();
    expect(screen.getByText("Підключити Monobank")).toBeTruthy();
  });

  it("renders webhook status when connected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: "2024-03-15T12:00:00Z",
      lastBackfillAt: null,
      accountsCount: 3,
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Webhook активний")).toBeTruthy();
    });
    expect(screen.getByText(/3 рахунків/)).toBeTruthy();
    expect(screen.getByText("Синхронізувати історію")).toBeTruthy();
  });

  it("calls monoWebhookApi.connect on submit", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    mockedConnect.mockResolvedValue({ status: "active", accountsCount: 1 });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Токен Monobank API")).toBeTruthy();
    });

    const input = screen.getByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "my-webhook-token" } });

    const btn = screen.getByText("Підключити Monobank");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedConnect).toHaveBeenCalledWith(
        "my-webhook-token",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    // Token must NOT be stored in browser — server-side only post roadmap-A.
    expect(localStorage.getItem("finyk_token")).toBeNull();
    expect(sessionStorage.getItem("finyk_token")).toBeNull();
  });

  it("does not surface legacy info-cache name (webhook-only mode)", async () => {
    localStorage.setItem(
      "finyk_info_cache",
      JSON.stringify({
        info: { name: "Тест", accounts: [] },
      }),
    );
    localStorage.setItem("finyk_token", "secret-token-abc");
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/Токен відправляється на сервер/)).toBeTruthy();
    });

    // Legacy info-cache should never reach the UI in webhook-only mode.
    expect(screen.queryByText("Тест Юзер")).toBeNull();
    // Legacy token section should not be visible.
    expect(screen.queryByText(/secret-token/)).toBeNull();
  });
});
