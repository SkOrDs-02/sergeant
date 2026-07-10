// @vitest-environment jsdom
/**
 * Extra coverage for FinykApp — exercises branches left uncovered by the
 * primary smoke suite: pwaAction effect, URL-sync effect, first-run
 * navigation, ManualExpenseSheet onSave / onDelete callbacks,
 * handlePostSavePrompt cross-module prompts, login-overlay callbacks,
 * SyncPill balance toggle, and FAB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── Stable mock references ────────────────────────────────────────────────────

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  show: vi.fn(),
  warning: vi.fn(),
};

const navigateMock = vi.fn();

const storageMock: {
  showBalance: boolean;
  setShowBalance: ReturnType<typeof vi.fn>;
  manualExpenses: Array<{ id: string; category?: string }>;
  addManualExpense: ReturnType<typeof vi.fn>;
  editManualExpense: ReturnType<typeof vi.fn>;
  removeManualExpense: ReturnType<typeof vi.fn>;
  loadFromUrl: ReturnType<typeof vi.fn>;
} = {
  showBalance: true,
  setShowBalance: vi.fn(),
  manualExpenses: [],
  addManualExpense: vi.fn(),
  editManualExpense: vi.fn(),
  removeManualExpense: vi.fn(),
  loadFromUrl: vi.fn(() => false),
};

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
  useStorage: vi.fn(() => storageMock),
}));

vi.mock("./hooks/useFinykRoute", () => ({
  useFinykRoute: vi.fn(() => ["overview", navigateMock]),
  useFinykQueryParam: vi.fn(() => null),
}));

vi.mock("./hooks/useUnifiedFinanceData", () => ({
  useUnifiedFinanceData: vi.fn(() => ({
    mergedMono: { accounts: [], transactions: [], syncState: null },
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
  useModuleFirstRun: vi.fn(() => ({ firstRun: false, markSeen: vi.fn() })),
}));

vi.mock("../../core/onboarding/presetPrefill", () => ({
  consumePresetPrefill: vi.fn(() => null),
}));

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
  useToast: () => toastMock,
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

vi.mock("../../core/lib/lazyImport", () => ({
  lazyImport: (_factory: unknown, name: string) => {
    const Stub = () => <div data-testid={`lazy-${name}`} />;
    Stub.displayName = name;
    return Stub;
  },
}));

vi.mock("./pages/Overview", () => ({
  Overview: () => <div data-testid="finyk-overview" />,
}));

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

// ManualExpenseSheet exposes onSave / onDelete / onClose buttons when open.
vi.mock("./components/ManualExpenseSheet", () => ({
  ManualExpenseSheet: ({
    open,
    onSave,
    onDelete,
    onClose,
  }: {
    open: boolean;
    onSave: (e: { id?: string; category?: string }) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="expense-sheet">
        <button
          type="button"
          data-testid="save-add"
          onClick={() => onSave({ category: "other" })}
        >
          save-add
        </button>
        <button
          type="button"
          data-testid="save-cafe"
          onClick={() => onSave({ category: "cafe" })}
        >
          save-cafe
        </button>
        <button
          type="button"
          data-testid="save-food"
          onClick={() => onSave({ category: "food" })}
        >
          save-food
        </button>
        <button
          type="button"
          data-testid="save-edit"
          onClick={() => onSave({ id: "exp-1", category: "other" })}
        >
          save-edit
        </button>
        <button
          type="button"
          data-testid="delete-exp"
          onClick={() => onDelete("exp-1")}
        >
          delete
        </button>
        <button type="button" data-testid="close-sheet" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));

vi.mock("./components/FinykLoginScreen", () => ({
  FinykLoginScreen: ({
    onContinueWithoutBank,
    onBackToHub,
  }: {
    onContinueWithoutBank: () => void;
    onBackToHub: () => void;
  }) => (
    <div data-testid="finyk-login-screen">
      <button type="button" onClick={onContinueWithoutBank}>
        Без банку overlay
      </button>
      <button type="button" onClick={onBackToHub}>
        Назад overlay
      </button>
    </div>
  ),
}));

vi.mock("@shared/components/ui/AIPill", () => ({
  AIPill: () => null,
}));

vi.mock("@shared/components/ui/FloatingActionButton", () => ({
  FloatingActionButton: ({
    onClick,
  }: {
    onClick: () => void;
    variant?: string;
    icon?: string;
    "aria-label"?: string;
  }) => (
    <button type="button" data-testid="fab" onClick={onClick}>
      FAB
    </button>
  ),
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

// ── Imports under test (must come after vi.mock declarations) ─────────────────
import FinykApp from "./FinykApp";
import { useFinykRoute } from "./hooks/useFinykRoute";
import { useMonobank } from "./hooks/useMonobank";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import { enableFinykManualOnly } from "./lib/demoData";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { tryShowCrossModulePrompt } from "@shared/lib/modules/crossModulePrompt";
import { consumePresetPrefill } from "../../core/onboarding/presetPrefill";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  storageMock.manualExpenses = [];
  storageMock.loadFromUrl.mockReturnValue(false);
});

// ── FAB / expense sheet ───────────────────────────────────────────────────────

describe("FinykApp (extra) — FAB opens expense sheet", () => {
  it("clicking FAB opens ManualExpenseSheet", () => {
    render(<FinykApp />);
    expect(screen.queryByTestId("expense-sheet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("fab"));
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
  });

  it("closing ManualExpenseSheet hides it", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-sheet"));
    expect(screen.queryByTestId("expense-sheet")).not.toBeInTheDocument();
  });
});

// ── ManualExpenseSheet onSave ─────────────────────────────────────────────────

describe("FinykApp (extra) — ManualExpenseSheet onSave", () => {
  it("onSave without id calls addManualExpense + success toast 'Витрату додано'", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("save-add"));
    expect(storageMock.addManualExpense).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Витрату додано.");
  });

  it("onSave with id calls editManualExpense + success toast 'Витрату оновлено'", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("save-edit"));
    expect(storageMock.editManualExpense).toHaveBeenCalledWith(
      "exp-1",
      expect.objectContaining({ id: "exp-1" }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Витрату оновлено.");
  });

  it("onSave with category='cafe' triggers restaurant cross-module prompt", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("save-cafe"));
    expect(tryShowCrossModulePrompt).toHaveBeenCalledWith(
      toastMock,
      expect.objectContaining({ id: "finyk-restaurant-to-meal" }),
    );
  });

  it("onSave with category='food' triggers food cross-module prompt", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("save-food"));
    expect(tryShowCrossModulePrompt).toHaveBeenCalledWith(
      toastMock,
      expect.objectContaining({ id: "finyk-food-to-meal" }),
    );
  });
});

// ── ManualExpenseSheet onDelete ───────────────────────────────────────────────

describe("FinykApp (extra) — ManualExpenseSheet onDelete", () => {
  it("onDelete without snapshot calls toast.success directly", () => {
    storageMock.manualExpenses = [];
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("delete-exp"));
    expect(storageMock.removeManualExpense).toHaveBeenCalledWith("exp-1");
    expect(toastMock.success).toHaveBeenCalledWith("Видалив витрату");
    expect(showUndoToast).not.toHaveBeenCalled();
  });

  it("onDelete with snapshot calls showUndoToast", () => {
    storageMock.manualExpenses = [{ id: "exp-1", category: "food" }];
    render(<FinykApp />);
    fireEvent.click(screen.getByTestId("fab"));
    fireEvent.click(screen.getByTestId("delete-exp"));
    expect(storageMock.removeManualExpense).toHaveBeenCalledWith("exp-1");
    expect(showUndoToast).toHaveBeenCalledWith(
      toastMock,
      expect.objectContaining({ msg: "Видалив витрату" }),
    );
  });
});

// ── pwaAction ─────────────────────────────────────────────────────────────────

describe("FinykApp (extra) — pwaAction='add_expense'", () => {
  it("navigates to transactions and opens expense sheet on mount", () => {
    const onPwaActionConsumed = vi.fn();
    render(
      <FinykApp
        pwaAction="add_expense"
        onPwaActionConsumed={onPwaActionConsumed}
      />,
    );
    expect(navigateMock).toHaveBeenCalledWith("transactions");
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
    expect(onPwaActionConsumed).toHaveBeenCalled();
  });

  it("calls consumePresetPrefill for finyk on add_expense action", () => {
    render(<FinykApp pwaAction="add_expense" />);
    expect(consumePresetPrefill).toHaveBeenCalledWith("finyk");
  });
});

// ── URL sync effect ───────────────────────────────────────────────────────────

describe("FinykApp (extra) — URL sync effect", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      search: "?sync=abc",
      href: "http://localhost/?sync=abc",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls toast.success when loadFromUrl returns true", () => {
    storageMock.loadFromUrl.mockReturnValue(true);
    render(<FinykApp />);
    expect(toastMock.success).toHaveBeenCalledWith(
      "Налаштування синхронізовано!",
    );
  });

  it("calls toast.error when loadFromUrl returns false", () => {
    storageMock.loadFromUrl.mockReturnValue(false);
    render(<FinykApp />);
    expect(toastMock.error).toHaveBeenCalledWith(
      "Не вдалось завантажити синк-даних",
    );
  });
});

// ── First-run navigation ──────────────────────────────────────────────────────

describe("FinykApp (extra) — first-run navigation", () => {
  it("navigates to budgets on first run when page is not budgets", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValueOnce(["overview", navigateMock]);
    render(<FinykApp />);
    expect(navigateMock).toHaveBeenCalledWith("budgets");
  });

  it("does not navigate away when already on budgets", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValueOnce(["budgets", navigateMock]);
    render(<FinykApp />);
    expect(navigateMock).not.toHaveBeenCalledWith("budgets");
  });

  it("skips first-run navigate when pwaAction is add_expense", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValueOnce(["overview", navigateMock]);
    render(<FinykApp pwaAction="add_expense" />);
    // pwaAction effect navigates to "transactions", NOT to "budgets"
    expect(navigateMock).not.toHaveBeenCalledWith("budgets");
    expect(navigateMock).toHaveBeenCalledWith("transactions");
  });
});

// ── Login overlay callbacks ───────────────────────────────────────────────────

describe("FinykApp (extra) — login overlay callbacks", () => {
  it("'Без банку overlay' calls enableFinykManualOnly and closes overlay", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByText("Підключити"));
    expect(screen.getByTestId("finyk-login-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Без банку overlay"));
    expect(enableFinykManualOnly).toHaveBeenCalled();
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
  });

  it("'Назад overlay' closes the login overlay", () => {
    render(<FinykApp />);
    fireEvent.click(screen.getByText("Підключити"));
    expect(screen.getByTestId("finyk-login-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Назад overlay"));
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
  });
});

// ── SyncPill balance toggle ───────────────────────────────────────────────────

describe("FinykApp (extra) — SyncPill balance toggle", () => {
  it("clicking the eye button calls setShowBalance with the toggled value", () => {
    render(<FinykApp />);
    const eyeButton = screen.getByRole("button", {
      name: /приховати суми|показати суми/i,
    });
    fireEvent.click(eyeButton);
    // showBalance was true; toggled → false
    expect(storageMock.setShowBalance).toHaveBeenCalledWith(false);
  });
});

// ── authError banner — onBackToHub link ─────────────────────────────────────

describe("FinykApp (extra) — authError banner onBackToHub link", () => {
  it("renders 'Оновити токен' link when onBackToHub is provided", () => {
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
    const onBackToHub = vi.fn();
    render(<FinykApp onBackToHub={onBackToHub} />);
    const link = screen.getByText("Оновити токен у Налаштуваннях Hub");
    fireEvent.click(link);
    expect(onBackToHub).toHaveBeenCalled();
  });
});

// ── settings button visible ───────────────────────────────────────────────────

describe("FinykApp (extra) — settings button", () => {
  it("renders without error when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    expect(() =>
      render(<FinykApp onOpenSettings={onOpenSettings} />),
    ).not.toThrow();
  });
});
