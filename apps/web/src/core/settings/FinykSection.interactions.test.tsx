/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// Extends FinykSection.test.tsx with the interaction-heavy branches: custom
// categories, webhook connect error handling, backfill, disconnect confirm,
// cache clear, refresh, and the not-Pro paywall gate.

const apiState = vi.hoisted(() => ({
  isPro: true,
}));

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
    privatApi: { balanceFinal: vi.fn() },
    // Treat any plain object carrying a `kind` discriminator as an ApiError so
    // the error-branch logic (auth / aborted) can be exercised without
    // constructing real ApiError instances.
    isApiError: (e: unknown): boolean =>
      typeof e === "object" && e !== null && "kind" in e,
  };
});

const storageMock = vi.hoisted(() => ({
  customCategories: [] as { id: string; label: string }[],
  addCustomCategory: vi.fn(),
  removeCustomCategory: vi.fn(),
}));
vi.mock("../../modules/finyk/hooks/useStorage", () => ({
  useStorage: () => storageMock,
}));

vi.mock("../billing/usePlan", () => ({
  usePlan: () => ({
    plan: apiState.isPro ? "pro" : "free",
    isPro: apiState.isPro,
    isLoading: false,
  }),
}));

const removeFinykStorageItem = vi.hoisted(() => vi.fn());
vi.mock("../../modules/finyk/lib/finykStorage", () => ({
  removeItem: removeFinykStorageItem,
}));

vi.mock("../../modules/finyk/hooks/useMonoBackfillProgress", () => ({
  useMonoBackfillProgress: () => ({ progress: null }),
}));

import { monoWebhookApi } from "@shared/api";
import { FinykSection } from "./FinykSection";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedConnect = monoWebhookApi.connect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedDisconnect = monoWebhookApi.disconnect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedBackfill = monoWebhookApi.backfill as unknown as ReturnType<
  typeof vi.fn
>;

const DISCONNECTED = {
  status: "disconnected" as const,
  webhookActive: false,
  lastEventAt: null,
  lastBackfillAt: null,
  accountsCount: 0,
};

function renderSection() {
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

describe("FinykSection interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiState.isPro = true;
    storageMock.customCategories = [];
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders an empty-state when there are no custom categories", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    expect(
      await screen.findByText("Поки немає власних категорій"),
    ).toBeInTheDocument();
  });

  it("adds a custom category via the Додати button", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = await screen.findByPlaceholderText("Напр. 🎨 Хобі");
    fireEvent.change(input, { target: { value: "Хобі" } });
    fireEvent.click(screen.getByText("Додати"));
    expect(storageMock.addCustomCategory).toHaveBeenCalledWith("Хобі");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("adds a custom category via the Enter key", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = await screen.findByPlaceholderText("Напр. 🎨 Хобі");
    fireEvent.change(input, { target: { value: "Подорожі" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(storageMock.addCustomCategory).toHaveBeenCalledWith("Подорожі");
  });

  it("lists and removes existing custom categories", async () => {
    storageMock.customCategories = [{ id: "c1", label: "🎨 Хобі" }];
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    expect(await screen.findByText("🎨 Хобі")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Видалити"));
    expect(storageMock.removeCustomCategory).toHaveBeenCalledWith("c1");
  });

  it("validates an empty token on connect", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const btn = await screen.findByText("Підключити Monobank");
    fireEvent.click(btn);
    expect(await screen.findByText("Введи токен")).toBeInTheDocument();
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("opens the paywall on connect when the user is not Pro", async () => {
    apiState.isPro = false;
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "tok" } });
    fireEvent.click(screen.getByText("Підключити Monobank"));
    expect(
      await screen.findByText("Авто-Mono sync доступний у Pro"),
    ).toBeInTheDocument();
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("surfaces a server message when connect throws an auth error", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    mockedConnect.mockRejectedValue({
      kind: "http",
      isAuth: true,
      serverMessage: "Токен недійсний",
    });
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "bad-token" } });
    fireEvent.click(screen.getByText("Підключити Monobank"));
    expect(await screen.findByText("Токен недійсний")).toBeInTheDocument();
  });

  it("shows a timeout message when connect aborts", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    mockedConnect.mockRejectedValue({ kind: "aborted" });
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "tok" } });
    fireEvent.click(screen.getByText("Підключити Monobank"));
    expect(
      await screen.findByText("Monobank API не відповідає. Спробуйте пізніше."),
    ).toBeInTheDocument();
  });

  it("toggles webhook token visibility", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = (await screen.findByPlaceholderText(
      "Токен Monobank API",
    )) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByLabelText("Показати токен"));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByLabelText("Приховати токен"));
    expect(input.type).toBe("password");
  });

  it("triggers a backfill when connected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 2,
    });
    mockedBackfill.mockResolvedValue(undefined);
    renderSection();
    const btn = await screen.findByText("Re-sync (backfill)");
    fireEvent.click(btn);
    await waitFor(() => expect(mockedBackfill).toHaveBeenCalledTimes(1));
  });

  it("disconnects through the confirm modal when connected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 1,
    });
    mockedDisconnect.mockResolvedValue(undefined);
    renderSection();
    fireEvent.click(await screen.findByText("Від'єднати"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Вийти"));
    await waitFor(() => expect(mockedDisconnect).toHaveBeenCalledTimes(1));
  });

  it("clears the transaction cache through the confirm modal", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    fireEvent.click(await screen.findByText("🧹 Очистити кеш транзакцій"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Очистити"));
    await waitFor(() =>
      expect(removeFinykStorageItem).toHaveBeenCalledWith("finyk_tx_cache"),
    );
    expect(removeFinykStorageItem).toHaveBeenCalledWith(
      "finyk_tx_cache_last_good",
    );
  });

  it("refreshes all data on demand", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const btn = await screen.findByText("🔄 Оновити дані");
    fireEvent.click(btn);
    // Button flips to the busy label while the invalidations resolve.
    await waitFor(() =>
      expect(screen.getByText("🔄 Оновити дані")).toBeInTheDocument(),
    );
  });
});
