/** @vitest-environment jsdom */
/**
 * Branch coverage for FinykSection — gaps not covered by
 * FinykSection.test.tsx, FinykSection.interactions.test.tsx, or
 * FinykSection.extra.test.tsx: useInView query gate, paywall dismiss,
 * webhook connect trim/connecting UI, BackfillProgressPill completed/failed
 * states, and active-status styling.
 */
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

const apiState = vi.hoisted(() => ({ isPro: true }));
const inViewState = vi.hoisted(() => ({ inView: true }));

const backfillState = vi.hoisted(() => ({
  status: null as string | null,
  lastError: null as string | null,
}));

vi.mock("@shared/hooks/useInView", () => ({
  useInView: () => [vi.fn(), inViewState.inView],
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
    isApiError: (e: unknown): boolean =>
      typeof e === "object" && e !== null && "kind" in e,
  };
});

const storageMock = vi.hoisted(() => ({
  customCategories: [] as { id: string; label: string }[],
  addCustomCategory: vi.fn(),
  removeCustomCategory: vi.fn(),
}));
vi.mock("@finyk/hooks/useStorage", () => ({
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
vi.mock("@finyk/lib/finykStorage", () => ({
  removeItem: removeFinykStorageItem,
}));

vi.mock("@finyk/hooks/useMonoBackfillProgress", () => ({
  useMonoBackfillProgress: () => ({
    progress: backfillState.status
      ? {
          status: backfillState.status,
          accountsProcessed: 2,
          accountsTotal: 3,
          transactionsProcessed: 120,
          lastError: backfillState.lastError,
        }
      : null,
  }),
}));

import { monoWebhookApi } from "@shared/api";
import { FinykSection } from "./FinykSection";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedConnect = monoWebhookApi.connect as unknown as ReturnType<
  typeof vi.fn
>;

const DISCONNECTED = {
  status: "disconnected" as const,
  webhookActive: false,
  lastEventAt: null,
  lastBackfillAt: null,
  accountsCount: 0,
};

const ACTIVE = {
  status: "active" as const,
  webhookActive: true,
  lastEventAt: "2024-06-01T10:00:00Z",
  lastBackfillAt: null,
  accountsCount: 2,
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

describe("FinykSection branch gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiState.isPro = true;
    inViewState.inView = true;
    backfillState.status = null;
    backfillState.lastError = null;
    storageMock.customCategories = [];
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ── useInView gate (PR-1.2) ───────────────────────────────────────────────

  it("does not fetch mono sync state while the section is off-screen", async () => {
    inViewState.inView = false;
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    // Disconnected UI still renders (null sync data ⇒ not connected), but the
    // RQ query must stay dormant until `inView` flips true.
    expect(
      await screen.findByPlaceholderText("Токен Monobank API"),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockedSyncState).not.toHaveBeenCalled());
  });

  it("fetches mono sync state once the section scrolls into view", async () => {
    inViewState.inView = true;
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    await waitFor(() => expect(mockedSyncState).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByPlaceholderText("Токен Monobank API"),
    ).toBeInTheDocument();
  });

  // ── Paywall dismiss ───────────────────────────────────────────────────────

  it("dismisses the paywall via «Не зараз» without connecting", async () => {
    apiState.isPro = false;
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "tok" } });
    fireEvent.click(screen.getByText("Підключити Monobank"));
    expect(
      await screen.findByText("Авто-Mono sync доступний у Pro"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Не зараз"));
    await waitFor(() =>
      expect(
        screen.queryByText("Авто-Mono sync доступний у Pro"),
      ).not.toBeInTheDocument(),
    );
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  // ── Webhook connect: trim + connecting UI ─────────────────────────────────

  it("trims whitespace from the webhook token before connect", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    mockedConnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: "active", accountsCount: 1 }), 50);
        }),
    );
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "  spaced-token  " } });
    fireEvent.click(screen.getByText("Підключити Monobank"));

    await waitFor(() =>
      expect(mockedConnect).toHaveBeenCalledWith(
        "spaced-token",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("shows the connecting label and disables the button while connect is in flight", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    let resolveConnect!: (value: unknown) => void;
    mockedConnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        }),
    );
    renderSection();
    const input = await screen.findByPlaceholderText("Токен Monobank API");
    fireEvent.change(input, { target: { value: "tok" } });
    const btn = screen.getByText("Підключити Monobank").closest("button");
    fireEvent.click(btn!);

    await waitFor(() => expect(btn).toHaveAttribute("disabled"));
    resolveConnect({ status: "active", accountsCount: 1 });
  });

  // ── BackfillProgressPill: completed / failed ──────────────────────────────

  it("renders BackfillProgressPill when backfill completed", async () => {
    backfillState.status = "completed";
    mockedSyncState.mockResolvedValue(ACTIVE);
    renderSection();
    expect(await screen.findByText("Завершено")).toBeInTheDocument();
    expect(screen.getByText(/120 транзакцій/)).toBeInTheDocument();
  });

  it("renders BackfillProgressPill with error detail when backfill failed", async () => {
    backfillState.status = "failed";
    backfillState.lastError = "rate limit";
    mockedSyncState.mockResolvedValue(ACTIVE);
    renderSection();
    expect(await screen.findByText("Помилка backfill")).toBeInTheDocument();
    expect(screen.getByText("rate limit")).toBeInTheDocument();
  });

  // ── Active webhook status styling ─────────────────────────────────────────

  it("applies green border styling when webhook status is active", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE);
    renderSection();
    const label = await screen.findByText("Webhook активний");
    const card = label.closest("[class*='border-']");
    expect(card?.className).toContain("border-success/30");
  });

  // ── Disconnect confirm copy ───────────────────────────────────────────────

  it("shows the Monobank disconnect title in the confirm modal", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE);
    renderSection();
    fireEvent.click(await screen.findByText("Від'єднати"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Вийти з Monobank?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Webhook-з'єднання буде від'єднано/),
    ).toBeInTheDocument();
  });

  // ── Category button path (no trim guard) ──────────────────────────────────

  it("invokes addCustomCategory via the Додати button and clears the input", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED);
    renderSection();
    const input = (await screen.findByPlaceholderText(
      "Напр. 🎨 Хобі",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Спорт" } });
    fireEvent.click(screen.getByText("Додати"));
    expect(storageMock.addCustomCategory).toHaveBeenCalledWith("Спорт");
    expect(input.value).toBe("");
  });
});
