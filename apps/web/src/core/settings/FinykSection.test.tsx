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
    // Silpo card lives alongside the Mono webhook section in the same
    // "Фінік" group — without this mock `useSilpoSyncState` would hit the
    // real `httpClient` fetch in jsdom and every test in this file would
    // hang/reject on the unmocked network call.
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
    silpoConnectUrl: () => "https://example.test/api/v1/silpo/connect",
    isApiError: actual.isApiError,
  };
});

// «Приховувати суми» живе тут з 2026-10-08 (переїхало з шапки Фініка), тож
// мок хука віддає і цей стан: `showBalance` мутабельний між тестами.
// `vi.hoisted`, бо фабрика `vi.mock` піднімається над `const` і без цього
// читала б ще не ініціалізовану змінну.
const storageState = vi.hoisted(() => ({
  showBalance: true,
  setShowBalance: vi.fn(),
}));

vi.mock("@finyk/hooks/useStorage", () => ({
  useStorage: () => ({
    hiddenAccounts: [],
    toggleHideAccount: vi.fn(),
    customCategories: [],
    addCustomCategory: vi.fn(),
    removeCustomCategory: vi.fn(),
    get showBalance() {
      return storageState.showBalance;
    },
    setShowBalance: storageState.setShowBalance,
  }),
}));

// `SilpoIntegrationSection` calls `useToast()` (sync/disconnect/wipe result
// toasts) — this suite has no `<ToastProvider>` in its render tree, so
// stub the hook directly rather than adding an unrelated provider.
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}));

vi.mock("../../modules/finyk/utils", () => ({
  getAccountLabel: (acc: { id: string }) => `Account ${acc.id}`,
}));

import { billingApi, monoWebhookApi, silpoApi } from "@shared/api";
import { accessFixture } from "../../test/helpers/billingAccess";
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
const mockedSilpoSyncState = silpoApi.syncState as unknown as ReturnType<
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
      access: accessFixture("pro"),
    });
    mockedSilpoSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
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
      expect(screen.getByText("Синхронізація активна")).toBeTruthy();
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

  // V-13 (profile/settings deep audit 2026-08-08, §«Вкладка Розділи») —
  // без `module="finyk"` іконка секції рендериться нейтрально-сірою.
  // Перевіряємо, що бейдж іконки несе саме finyk-акцент.
  it("renders the section glyph with the finyk module accent (без тонованого квадрата, огляд 2026-09-04)", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    const { container } = renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText(/Токен відправляється на сервер/)).toBeTruthy();
    });
    const badge = container.querySelector(`.text-${"finyk"}`);
    expect(badge).not.toBeNull();
  });

  // Правила «Завжди так для цього магазину» (рішення власника 2026-10-01):
  // керування живе тут, у Налаштуваннях → Фінік.
  it("показує підрозділ «Правила категорій» з порожнім станом, поки правил нема", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    renderWithProviders();
    expect(screen.getByText("Правила категорій")).toBeInTheDocument();
    expect(screen.getByText("Правил поки немає")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Токен відправляється на сервер/)).toBeTruthy();
    });
  });

  // «Приховувати суми» (анти-слоп раунд 4, Q5): перемикач інвертує
  // `showBalance`, бо користувач вмикає ПРИХОВУВАННЯ, а сховище зберігає
  // ПОКАЗ.
  it("тумблер «Приховувати суми» інвертує showBalance", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    storageState.showBalance = true;
    renderWithProviders();
    expect(screen.getByText("Показ сум")).toBeInTheDocument();
    // Група «Фінік» на першому рендері згорнута (`inert` + `aria-hidden`,
    // див. `SettingsGroup`), тож без `hidden: true` роль не знаходиться.
    const toggle = screen.getByRole("switch", {
      name: /Приховувати суми/,
      hidden: true,
    });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(storageState.setShowBalance).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(screen.getByText(/Токен відправляється на сервер/)).toBeTruthy();
    });
  });
});
