// @vitest-environment jsdom
/**
 * Extra coverage for FinykApp — exercises branches left uncovered by the
 * primary smoke suite: pwaAction effect, URL-sync effect, first-run
 * navigation, ManualExpenseSheet onSave / onDelete callbacks,
 * handlePostSavePrompt cross-module prompts, login-overlay callbacks,
 * SyncPill balance toggle, and the add-expense bar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// ── Stable mock references ────────────────────────────────────────────────────

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  show: vi.fn(),
  warning: vi.fn(),
};

const navigateMock = vi.fn();

// `onOpenAuth` обовʼязковий (A1, аудит 2026-09-11 хвиля 2) — жоден із
// тестів цього файлу не цікавиться входом, тож усі рендери дістають
// один спільний no-op замість `undefined`.
const NOOP_AUTH = () => {};

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
    mergedMono: { accounts: [], transactions: [], realTx: [], syncState: null },
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
  writeRaw: vi.fn(),
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
    pill: "text-muted",
    icon: "wifi-off",
    needsAttention: true,
  })),
}));

const swipeState = vi.hoisted(() => ({
  dragDx: 0,
  handlers: {} as {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
  },
}));
vi.mock("@shared/hooks/useSwipeNavigation", () => ({
  SWIPE_DEAD_ZONE_PX: 12,
  useSwipeNavigation: vi.fn(
    (opts: { onSwipeLeft?: () => void; onSwipeRight?: () => void }) => {
      swipeState.handlers = opts;
      return {
        onTouchStart: vi.fn(),
        onTouchMove: vi.fn(),
        onTouchEnd: vi.fn(),
        dragDx: swipeState.dragDx,
      };
    },
  ),
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

// ЧАСТКОВИЙ мок: підміняємо лише `openHubModuleWithAction`, решту лишаємо
// справжньою. Повна підміна ламала збір файлу, щойно `appPaths.ts` почав
// імпортувати звідси `HUB_MODULE_IDS` — мок його не віддавав, і падав увесь
// suite на рівні імпорту, а не асерції. `importOriginal` знімає цей клас
// поломок назавжди: нові експорти доїжджають самі.
vi.mock("@shared/lib/modules/hubNav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/modules/hubNav")>()),
  openHubModuleWithAction: vi.fn(),
}));

vi.mock("../../core/lib/lazyImport", () => ({
  lazyImport: (_factory: unknown, name: string) => {
    const Stub = () => <div data-testid={`lazy-${name}`} />;
    Stub.displayName = name;
    // Mirror the real helper's `PreloadableLazy` shape — FinykApp warms page
    // chunks on pointer-down / swipe / idle (see `PAGE_PRELOADERS`).
    return Object.assign(Stub, { preload: () => {} });
  },
}));

vi.mock("./pages/Overview", () => ({
  Overview: () => <div data-testid="finyk-overview" />,
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
    onConnect,
  }: {
    onContinueWithoutBank: () => void;
    onBackToHub: () => void;
    onConnect: (token: string) => void;
  }) => (
    <div data-testid="finyk-login-screen">
      <button type="button" onClick={onContinueWithoutBank}>
        Без банку overlay
      </button>
      <button type="button" onClick={onBackToHub}>
        Назад overlay
      </button>
      <button type="button" onClick={() => onConnect("overlay-token")}>
        Connect overlay
      </button>
    </div>
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
import type { FinykPage } from "./lib/finykRouter";
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

describe("FinykApp (extra) — add-expense bar opens expense sheet", () => {
  it("clicking «Додати витрату» opens ManualExpenseSheet", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(screen.queryByTestId("expense-sheet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
  });

  it.each([
    "overview",
    "transactions",
    "budgets",
    "analytics",
    "assets",
  ] as const)("keeps the add-expense bar available on %s", (page) => {
    vi.mocked(useFinykRoute).mockReturnValueOnce([page, navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(screen.getByTestId("add-action-bar")).toBeInTheDocument();
  });

  it("closing ManualExpenseSheet hides it", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-sheet"));
    expect(screen.queryByTestId("expense-sheet")).not.toBeInTheDocument();
  });
});

// ── ManualExpenseSheet onSave ─────────────────────────────────────────────────

describe("FinykApp (extra) — ManualExpenseSheet onSave", () => {
  it("onSave without id calls addManualExpense + success toast 'Витрату додано'", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    fireEvent.click(screen.getByTestId("save-add"));
    expect(storageMock.addManualExpense).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Витрату додано.");
  });

  it("onSave with id calls editManualExpense + success toast 'Витрату оновлено'", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    fireEvent.click(screen.getByTestId("save-edit"));
    expect(storageMock.editManualExpense).toHaveBeenCalledWith(
      "exp-1",
      expect.objectContaining({ id: "exp-1" }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Витрату оновлено.");
  });

  it("onSave with category='cafe' triggers restaurant cross-module prompt", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    fireEvent.click(screen.getByTestId("save-cafe"));
    expect(tryShowCrossModulePrompt).toHaveBeenCalledWith(
      toastMock,
      expect.objectContaining({ id: "finyk-restaurant-to-meal" }),
    );
  });

  it("onSave with category='food' triggers food cross-module prompt", () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
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
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    fireEvent.click(screen.getByTestId("delete-exp"));
    expect(storageMock.removeManualExpense).toHaveBeenCalledWith("exp-1");
    expect(toastMock.success).toHaveBeenCalledWith("Витрату видалено");
    expect(showUndoToast).not.toHaveBeenCalled();
  });

  it("onDelete with snapshot calls showUndoToast", () => {
    storageMock.manualExpenses = [{ id: "exp-1", category: "food" }];
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    fireEvent.click(screen.getByTestId("delete-exp"));
    expect(storageMock.removeManualExpense).toHaveBeenCalledWith("exp-1");
    expect(showUndoToast).toHaveBeenCalledWith(
      toastMock,
      expect.objectContaining({ msg: "Витрату видалено" }),
    );
  });
});

// ── pwaAction ─────────────────────────────────────────────────────────────────

describe("FinykApp (extra) — pwaAction='add_expense'", () => {
  it("navigates to transactions and opens expense sheet when action arrives", async () => {
    const onPwaActionConsumed = vi.fn();
    const { rerender } = render(
      <FinykApp
        onOpenAuth={NOOP_AUTH}
        onPwaActionConsumed={onPwaActionConsumed}
      />,
    );
    rerender(
      <FinykApp
        onOpenAuth={NOOP_AUTH}
        pwaAction="add_expense"
        onPwaActionConsumed={onPwaActionConsumed}
      />,
    );
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("transactions");
    });
    expect(screen.getByTestId("expense-sheet")).toBeInTheDocument();
    await waitFor(() => {
      expect(onPwaActionConsumed).toHaveBeenCalled();
    });
  });

  it("calls consumePresetPrefill for finyk on add_expense action", async () => {
    const { rerender } = render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    rerender(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="add_expense" />);
    await waitFor(() => {
      expect(consumePresetPrefill).toHaveBeenCalledWith("finyk");
    });
  });
});

// ── URL sync effect ───────────────────────────────────────────────────────────

describe("FinykApp (extra) — ?sync= у URL ігнорується (data-26)", () => {
  // Регресія аудиту 2026-10-01: на маунті з `?sync=…` застосунок без
  // підтвердження підміняв бюджети/план/категорії/приховані рахунки даними з
  // URL і показував тост «синхронізовано». `loadFromUrl` лишено в моку як
  // шпигуна: приймача більше нема, тож його ніхто не має викликати.
  beforeEach(() => {
    vi.stubGlobal("location", {
      search: "?sync=abc",
      href: "http://localhost/?sync=abc",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("не викликає loadFromUrl і не показує жодного тоста", () => {
    storageMock.loadFromUrl.mockReturnValue(true);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(storageMock.loadFromUrl).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

// ── First-run navigation ──────────────────────────────────────────────────────

describe("FinykApp (extra) — first-run navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      pathname: "/finyk",
      search: "",
      href: "http://localhost/finyk",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Рішення founder-а 2026-07-25: перший вхід у finyk НЕ веде на фінплан.
  // Раніше тут стояли три тести, що закріплювали протилежне («navigates to
  // budgets on first run»). Вони проходили — і саме тому розбіжність A2
  // прожила в продукті: зелений тест стверджував, що навʼязаний редірект
  // це і є задум. Нижче — інверсія: асерти роблять неможливим його
  // повернення в будь-якому з трьох сценаріїв, де він раніше спрацьовував.
  it("не редіректить на budgets при першому вході з кореня /finyk", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValueOnce(["overview", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("не редіректить нікуди, коли юзер сам відкрив budgets", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValueOnce(["budgets", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("не редіректить при pwaAction=add_expense", () => {
    vi.mocked(useModuleFirstRun).mockReturnValue({
      firstRun: true,
      markSeen: vi.fn(),
    });
    vi.mocked(useFinykRoute).mockReturnValue(["overview", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="add_expense" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// ── Login overlay callbacks ───────────────────────────────────────────────────

describe("FinykApp (extra) — login overlay callbacks", () => {
  it("'Без банку overlay' calls enableFinykManualOnly and closes overlay", async () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="connect_bank" />);
    await screen.findByTestId("finyk-login-screen");
    fireEvent.click(screen.getByText("Без банку overlay"));
    expect(enableFinykManualOnly).toHaveBeenCalled();
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
  });

  it("'Назад overlay' closes the login overlay", async () => {
    render(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="connect_bank" />);
    await screen.findByTestId("finyk-login-screen");
    fireEvent.click(screen.getByText("Назад overlay"));
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
  });
});

// ── authError banner — onOpenSettings link ──────────────────────────────────

// Регресія PR-F2 (аудит 2026-09-13, хвиля 3): CTA підписаний «Оновити
// токен у Налаштуваннях Hub», але раніше кликав `onBackToHub` («Назад») —
// людина верталась у Hub, а не в Налаштування, попри те що `onOpenSettings`
// був поруч і не використовувався.
describe("FinykApp (extra) — authError banner onOpenSettings link", () => {
  it("renders 'Оновити токен' link and calls onOpenSettings, not onBackToHub", () => {
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
    const onOpenSettings = vi.fn();
    render(
      <FinykApp
        onOpenAuth={NOOP_AUTH}
        onBackToHub={onBackToHub}
        onOpenSettings={onOpenSettings}
      />,
    );
    const link = screen.getByText("Оновити токен у Налаштуваннях");
    fireEvent.click(link);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onBackToHub).not.toHaveBeenCalled();
  });

  it("does not render the link when onOpenSettings is missing", () => {
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
    render(<FinykApp onOpenAuth={NOOP_AUTH} onBackToHub={vi.fn()} />);
    expect(
      screen.queryByText("Оновити токен у Налаштуваннях"),
    ).not.toBeInTheDocument();
  });
});

// ── settings button visible ───────────────────────────────────────────────────

describe("FinykApp (extra) — settings button", () => {
  it("renders without error when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    expect(() =>
      render(
        <FinykApp onOpenAuth={NOOP_AUTH} onOpenSettings={onOpenSettings} />,
      ),
    ).not.toThrow();
  });
});

// ── «Приховати суми» більше не в шапці ───────────────────────────────────────

describe("FinykApp (extra) — hide-amounts control lives in Settings, not the header", () => {
  // Перемикач переїхав у `core/settings/FinykSection.tsx` (анти-слоп раунд
  // 4, Q5): у шапці на 375px він відбирав у назви модуля 44px. Поведінка
  // самого перемикача тепер тестується в `FinykSection.test.tsx`.
  it("renders no eye button in the header even when balance is hidden", () => {
    storageMock.showBalance = false;
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(
      screen.queryByRole("button", { name: /показати суми|приховати суми/i }),
    ).toBeNull();
  });
});

// ── Мід-жест рендер: сторінка лишається на місці ─────────────────────────────

describe("FinykApp (extra) — mid-drag render", () => {
  afterEach(() => {
    swipeState.dragDx = 0;
  });

  it("keeps rendering the page while a drag offset is live", () => {
    swipeState.dragDx = 60;
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    // `SwipePages` кладе інлайн-transform на обгортку; вміст модуля від цього
    // не зникає. Сама трансформація перевіряється в `SwipePages.test.tsx`.
    expect(screen.getByTestId("finyk-overview")).toBeInTheDocument();
  });
});

// ── Login overlay onConnect ───────────────────────────────────────────────────

describe("FinykApp (extra) — login overlay onConnect callback", () => {
  it("calls mono.connect with the token from the login overlay", async () => {
    const connectMock = vi.fn();
    vi.mocked(useMonobank).mockReturnValue({
      clientInfo: null,
      connecting: false,
      error: null,
      authError: null,
      setAuthError: vi.fn(),
      connect: connectMock,
      accounts: [],
      transactions: [],
      syncState: null,
    } as unknown as ReturnType<typeof useMonobank>);

    // Оверлей входу відкриває PWA-дія `connect_bank` (банера «підключи
    // банк» більше немає, redesign v3).
    render(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="connect_bank" />);
    await screen.findByTestId("finyk-login-screen");

    // Click the connect button in the overlay
    fireEvent.click(screen.getByText("Connect overlay"));
    expect(connectMock).toHaveBeenCalledWith("overlay-token");
  });
});

// ── renderPage — all page variants ───────────────────────────────────────────

describe("FinykApp (extra) — page routing", () => {
  it("renders the overview page by default", () => {
    vi.mocked(useFinykRoute).mockReturnValue(["overview", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(screen.getByTestId("finyk-overview")).toBeInTheDocument();
  });

  it.each([
    ["transactions", "lazy-Transactions"],
    ["budgets", "lazy-Budgets"],
    ["analytics", "lazy-Analytics"],
    ["assets", "lazy-Assets"],
  ] as const)("renders the %s page shell", (page, testId) => {
    vi.mocked(useFinykRoute).mockReturnValue([page, navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it("swipes left from overview to the next nav page", () => {
    vi.mocked(useFinykRoute).mockReturnValue(["overview", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    swipeState.handlers.onSwipeLeft?.();
    expect(navigateMock).toHaveBeenCalledWith("transactions");
  });

  it("swipes right from transactions back to overview", () => {
    vi.mocked(useFinykRoute).mockReturnValue(["transactions", navigateMock]);
    render(<FinykApp onOpenAuth={NOOP_AUTH} />);
    swipeState.handlers.onSwipeRight?.();
    expect(navigateMock).toHaveBeenCalledWith("overview");
  });

  it("renders null for an unknown page route without crashing", () => {
    vi.mocked(useFinykRoute).mockReturnValue([
      "unknown" as unknown as FinykPage,
      navigateMock,
    ]);
    expect(() => render(<FinykApp onOpenAuth={NOOP_AUTH} />)).not.toThrow();
  });
});

// ── Auto-close login overlay on clientInfo change ─────────────────────────────

describe("FinykApp (extra) — auto-close login overlay when clientInfo arrives", () => {
  it("closes the overlay when clientInfo becomes non-null after opening", async () => {
    vi.mocked(useFinykRoute).mockReturnValue(["overview", navigateMock]);
    const { rerender } = render(
      <FinykApp onOpenAuth={NOOP_AUTH} pwaAction="connect_bank" />,
    );
    await screen.findByTestId("finyk-login-screen");

    // Simulate clientInfo arriving (successful connect)
    vi.mocked(useMonobank).mockReturnValue({
      clientInfo: { accounts: [], name: "Тест" },
      connecting: false,
      error: null,
      authError: null,
      setAuthError: vi.fn(),
      connect: vi.fn(),
      accounts: [],
      transactions: [],
      syncState: null,
    } as unknown as ReturnType<typeof useMonobank>);
    rerender(<FinykApp onOpenAuth={NOOP_AUTH} pwaAction="connect_bank" />);

    // Overlay should be closed
    expect(screen.queryByTestId("finyk-login-screen")).not.toBeInTheDocument();
  });
});
