// @vitest-environment jsdom
/**
 * Smoke tests for FinykApp (the module shell).
 * Mocks heavy hooks and sub-components; verifies the shell mounts,
 * renders the header, nav bar, and the default overview page.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── Heavy hook stubs ─────────────────────────────────────────────────────────

vi.mock("./hooks/useMonobank", () => ({
  useMonobank: vi.fn(() => ({
    clientInfo: null,
    connecting: false,
    error: null,
    authError: null,
    setAuthError: vi.fn(),
    connect: vi.fn(),
    accounts: [],
    transactions: [],
    syncState: null,
  })),
}));

vi.mock("./hooks/usePrivatbank", () => ({
  usePrivatbank: vi.fn(() => ({
    accounts: [],
    transactions: [],
    syncState: null,
    loadingTx: false,
  })),
}));

vi.mock("./hooks/useStorage", () => ({
  useStorage: vi.fn(() => ({
    showBalance: true,
    setShowBalance: vi.fn(),
    manualExpenses: [],
    addManualExpense: vi.fn(),
    editManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
    loadFromUrl: vi.fn(() => false),
  })),
}));

vi.mock("./hooks/useFinykRoute", () => ({
  useFinykRoute: vi.fn(() => ["overview", vi.fn()]),
  useFinykQueryParam: vi.fn(() => null),
}));

vi.mock("./hooks/useUnifiedFinanceData", () => ({
  useUnifiedFinanceData: vi.fn(() => ({
    mergedMono: {
      accounts: [],
      transactions: [],
      syncState: null,
    },
    mergedRefresh: vi.fn(),
  })),
}));

vi.mock("./hooks/useFinykPersonalization", () => ({
  useFinykPersonalization: vi.fn(() => ({
    frequentCategories: [],
    frequentMerchants: [],
  })),
}));

vi.mock("./hooks/useMonoTokenMigration", () => ({
  useMonoTokenMigration: vi.fn(),
}));

vi.mock("../../core/onboarding/useModuleFirstRun", () => ({
  useModuleFirstRun: vi.fn(() => ({
    firstRun: false,
    markSeen: vi.fn(),
  })),
}));

vi.mock("../../core/onboarding/presetPrefill", () => ({
  consumePresetPrefill: vi.fn(() => null),
}));

// ── Storage / lib stubs ──────────────────────────────────────────────────────

vi.mock("./lib/finykStorage", () => ({
  readRaw: vi.fn(() => ""),
  writeJSON: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock("./lib/demoData", () => ({
  FINYK_MANUAL_ONLY_KEY: "finyk_manual_only",
  enableFinykManualOnly: vi.fn(),
}));

vi.mock("./components/SyncIndicator", () => ({
  getSyncTone: vi.fn(() => ({
    dot: "bg-muted",
    text: "не підключено",
    pill: "bg-panelHi text-muted border-line",
  })),
  SwipeProgressBar: () => null,
  SWIPE_THRESHOLD_PX: 80,
}));

// ── Shared hook stubs ────────────────────────────────────────────────────────

vi.mock("@shared/hooks/useSwipeNavigation", () => ({
  useSwipeNavigation: vi.fn(() => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    dragDx: 0,
  })),
}));

vi.mock("@shared/hooks/useDialogFocusTrap", () => ({
  useDialogFocusTrap: vi.fn(),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
    warning: vi.fn(),
  })),
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn(),
}));

vi.mock("@shared/lib/modules/crossModulePrompt", () => ({
  tryShowCrossModulePrompt: vi.fn(),
}));

vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModuleWithAction: vi.fn(),
}));

// ── Lazy page stubs ──────────────────────────────────────────────────────────

// Make lazyImport return a synchronous stub component so Suspense resolves
// immediately — avoids dealing with async chunk loading in jsdom.
vi.mock("../../core/lib/lazyImport", () => ({
  lazyImport: (_factory: unknown, name: string) => {
    const Stub = () => <div data-testid={`lazy-${name}`} />;
    Stub.displayName = name;
    return Stub;
  },
}));

// Eagerly-imported Overview page
vi.mock("./pages/Overview", () => ({
  Overview: () => <div data-testid="finyk-overview" />,
}));

// ── Module component stubs ───────────────────────────────────────────────────

vi.mock("./components/NoBankBanner", () => ({
  NoBankBanner: ({
    onConnect,
    onContinueManually,
  }: {
    onConnect: () => void;
    onContinueManually: () => void;
  }) => (
    <div data-testid="no-bank-banner">
      <button type="button" onClick={onConnect}>
        Підключити
      </button>
      <button type="button" onClick={onContinueManually}>
        Без банку
      </button>
    </div>
  ),
}));

vi.mock("./components/FinykManualExpenseConflictBanner", () => ({
  FinykManualExpenseConflictBanner: () => null,
}));

vi.mock("./components/ManualExpenseSheet", () => ({
  ManualExpenseSheet: () => null,
}));

vi.mock("./components/FinykLoginScreen", () => ({
  FinykLoginScreen: () => <div data-testid="finyk-login-screen" />,
}));

vi.mock("@shared/components/ui/AIPill", () => ({
  AIPill: () => null,
}));

vi.mock("@shared/components/ui/FloatingActionButton", () => ({
  FloatingActionButton: () => null,
}));

vi.mock("@shared/components/ui/ModuleBottomNav", () => ({
  ModuleBottomNav: ({
    activeId,
    ariaLabel,
  }: {
    activeId: string;
    items: unknown[];
    onChange: () => void;
    module: string;
    ariaLabel: string;
  }) => (
    <nav aria-label={ariaLabel} data-testid="finyk-nav">
      <span data-testid="active-page">{activeId}</span>
    </nav>
  ),
}));

// ── Import under test (must come after vi.mock declarations) ─────────────────
import FinykApp from "./FinykApp";
import { useFinykRoute } from "./hooks/useFinykRoute";
import { useMonobank } from "./hooks/useMonobank";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinykApp smoke tests", () => {
  it("mounts without crashing", () => {
    expect(() => render(<FinykApp />)).not.toThrow();
  });

  it("renders the ФІНІК header title", () => {
    render(<FinykApp />);
    expect(screen.getByText("ФІНІК")).toBeInTheDocument();
  });

  it("renders the bottom navigation bar", () => {
    render(<FinykApp />);
    expect(screen.getByTestId("finyk-nav")).toBeInTheDocument();
  });

  it("shows NoBankBanner when no bank is connected and manual-only is off", () => {
    render(<FinykApp />);
    // clientInfo is null and manualOnly is false → NoBankBanner should render
    expect(screen.getByTestId("no-bank-banner")).toBeInTheDocument();
  });

  it("renders the overview page by default", () => {
    render(<FinykApp />);
    expect(screen.getByTestId("finyk-overview")).toBeInTheDocument();
  });

  it("shows the monobank subtitle", () => {
    render(<FinykApp />);
    expect(screen.getByText("Monobank · бюджети")).toBeInTheDocument();
  });

  it("accepts all optional props without crashing", () => {
    expect(() =>
      render(
        <FinykApp
          onBackToHub={vi.fn()}
          onOpenSettings={vi.fn()}
          pwaAction={null}
          onPwaActionConsumed={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });

  it("tracks which page is active in the nav bar", () => {
    render(<FinykApp />);
    // Default page is "overview"
    expect(screen.getByTestId("active-page").textContent).toBe("overview");
  });
});

describe("FinykApp — page routing", () => {
  it("renders the transactions page when page is 'transactions'", () => {
    vi.mocked(useFinykRoute).mockReturnValueOnce(["transactions", vi.fn()]);
    render(<FinykApp />);
    expect(screen.getByTestId("lazy-Transactions")).toBeInTheDocument();
    expect(screen.queryByTestId("finyk-overview")).not.toBeInTheDocument();
  });

  it("renders the budgets page when page is 'budgets'", () => {
    vi.mocked(useFinykRoute).mockReturnValueOnce(["budgets", vi.fn()]);
    render(<FinykApp />);
    expect(screen.getByTestId("lazy-Budgets")).toBeInTheDocument();
  });

  it("renders the analytics page when page is 'analytics'", () => {
    vi.mocked(useFinykRoute).mockReturnValueOnce(["analytics", vi.fn()]);
    render(<FinykApp />);
    expect(screen.getByTestId("lazy-Analytics")).toBeInTheDocument();
  });

  it("renders the assets page when page is 'assets'", () => {
    vi.mocked(useFinykRoute).mockReturnValueOnce(["assets", vi.fn()]);
    render(<FinykApp />);
    expect(screen.getByTestId("lazy-Assets")).toBeInTheDocument();
  });
});

describe("FinykApp — connect/manual-only flows", () => {
  it("opens the login overlay when the connect button in NoBankBanner is clicked", () => {
    render(<FinykApp />);
    // Initially the login screen is NOT visible
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
    // Click the "Підключити" button in the NoBankBanner mock
    fireEvent.click(screen.getByText("Підключити"));
    // Login overlay should now show
    expect(screen.getByTestId("finyk-login-screen")).toBeInTheDocument();
  });

  it("hides NoBankBanner after manual-only is activated", () => {
    render(<FinykApp />);
    expect(screen.getByTestId("no-bank-banner")).toBeInTheDocument();
    // Click "Без банку" — calls enableFinykManualOnly() + setManualOnly(true)
    fireEvent.click(screen.getByText("Без банку"));
    // showNoBankBanner = !clientInfo && !manualOnly = false
    expect(screen.queryByTestId("no-bank-banner")).not.toBeInTheDocument();
  });
});

describe("FinykApp — authError banner", () => {
  it("renders the authError alert when mono has an authError", () => {
    vi.mocked(useMonobank).mockReturnValueOnce({
      clientInfo: null,
      connecting: false,
      error: null,
      authError: "Токен застарів",
      setAuthError: vi.fn(),
      connect: vi.fn(),
      accounts: [],
      transactions: [],
      syncState: null,
    } as unknown as ReturnType<typeof useMonobank>);
    render(<FinykApp />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Токен потребує оновлення")).toBeInTheDocument();
  });

  it("closes the authError banner when ✕ is clicked", () => {
    const setAuthError = vi.fn();
    vi.mocked(useMonobank).mockReturnValueOnce({
      clientInfo: null,
      connecting: false,
      error: null,
      authError: "Токен застарів",
      setAuthError,
      connect: vi.fn(),
      accounts: [],
      transactions: [],
      syncState: null,
    } as unknown as ReturnType<typeof useMonobank>);
    render(<FinykApp />);
    fireEvent.click(screen.getByLabelText("Закрити"));
    expect(setAuthError).toHaveBeenCalledWith("");
  });
});
