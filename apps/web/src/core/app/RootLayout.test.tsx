// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Smoke + wiring coverage for RootLayout. The component is a pure shell that
 * composes ~20 hooks and renders global UI (AppLock, HubChatOverlay,
 * boot-gates) around an <Outlet/>. Every hook + heavy child is mocked to a
 * trivial value so we exercise RootLayout's own JSX/branching (auth boot
 * gates, title effect, context plumbing) without their real implementations.
 */

const {
  authState,
  goToHubMock,
  openModuleMock,
  setSearchOpenMock,
  hubKeyboardCfg,
  useNutritionDualWriteBootMock,
  useNutritionSqliteReadBootMock,
  useFinykDualWriteBootMock,
  setFlagMock,
  navigationState,
} = vi.hoisted(() => ({
  authState: { user: null as { id: string } | null },
  goToHubMock: vi.fn(),
  openModuleMock: vi.fn(),
  setSearchOpenMock: vi.fn(),
  hubKeyboardCfg: {
    current: null as null | {
      onOpenSearch: () => void;
      onOpenShortcuts: () => void;
      onOpenAssistant: () => void;
      onNavigate: (target: string) => void;
    },
  },
  useNutritionDualWriteBootMock: vi.fn(),
  useNutritionSqliteReadBootMock: vi.fn(),
  useFinykDualWriteBootMock: vi.fn(),
  setFlagMock: vi.fn(),
  navigationState: { activeModule: null as string | null },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, isLoading: false }),
}));
vi.mock("../security/AppLockContext", () => ({
  useAppLockContext: () => ({
    state: "unlocked",
    unlock: vi.fn(),
    savePin: vi.fn(),
    finishSetup: vi.fn(),
  }),
}));
vi.mock("../security/AppLock", () => ({
  AppLock: ({ onSetupCancel }: { onSetupCancel: () => void }) => (
    <button type="button" data-testid="app-lock-cancel" onClick={onSetupCancel}>
      cancel-setup
    </button>
  ),
}));
vi.mock("../hub/HubChatOverlay", () => ({
  HubChatOverlay: () => <div data-testid="chat-overlay" />,
}));
vi.mock("@shared/components/ui/SkipLink", () => ({
  SkipLink: () => (
    <a data-testid="skip-link" href="#main">
      Skip to content
    </a>
  ),
}));
vi.mock("@shared/hooks/useTheme", () => ({ useTheme: vi.fn() }));
vi.mock("@shared/components/ui/KeyboardShortcutsModal", () => ({
  useKeyboardShortcutsModal: vi.fn(),
}));
vi.mock("@shared/components/ui/CommandPalette", () => ({
  useCommandPaletteHotkey: vi.fn(),
}));
vi.mock("../activation", () => ({ useActivationV2Boot: vi.fn() }));
vi.mock("../lib/featureFlags", () => ({
  setFlag: setFlagMock,
  useFlag: () => false,
}));
vi.mock("./useDemoCommands", () => ({ useDemoCommands: vi.fn() }));
vi.mock("../hooks/useHubKeyboardShortcuts", () => ({
  useHubKeyboardShortcuts: (cfg: typeof hubKeyboardCfg.current) => {
    hubKeyboardCfg.current = cfg;
  },
}));
vi.mock("../hooks/useBrowserLocation", () => ({
  useBrowserLocation: (loc: { search?: string }) => ({
    search: loc.search ?? "",
  }),
}));
vi.mock("../hooks/useHubNavigation", () => ({
  useHubNavigation: () => ({
    activeModule: navigationState.activeModule,
    openModule: openModuleMock,
    goToHub: goToHubMock,
    goBackOrHub: goToHubMock,
    goToModuleSettings: vi.fn(),
    moduleAnimClass: "",
  }),
}));
vi.mock("../hooks/useHubUIState", () => ({
  useHubUIState: () => ({
    searchOpen: false,
    setSearchOpen: setSearchOpenMock,
  }),
}));
vi.mock("../hooks/usePwaActions", () => ({
  usePwaActions: () => ({
    pwaAction: null,
    setPwaAction: vi.fn(),
    clearPwaAction: vi.fn(),
    validActions: [],
  }),
}));
vi.mock("./useAppEffects", () => ({ useAppEffects: vi.fn() }));
vi.mock("./useIosInstallBanner", () => ({
  useIosInstallBanner: () => ({ visible: false, dismiss: vi.fn() }),
}));
vi.mock("./usePwaInstall", () => ({
  usePwaInstall: () => ({
    canInstall: false,
    install: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("./useSWUpdate", () => ({
  useSWUpdate: () => ({ updateAvailable: false, applyUpdate: vi.fn() }),
}));
vi.mock("../../modules/nutrition/hooks/useNutritionDualWriteBoot", () => ({
  useNutritionDualWriteBoot: useNutritionDualWriteBootMock,
}));
vi.mock("../../modules/nutrition/hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: useNutritionSqliteReadBootMock,
}));
vi.mock("../../modules/finyk/hooks/useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: useFinykDualWriteBootMock,
}));

import { RootLayout } from "./RootLayout";
import { titleForPath } from "./appPaths";
import { useHubShell } from "./HubShellContext";

function ShortcutProbe() {
  const { shortcutsOpen } = useHubShell();
  return <div data-testid="shortcuts-open">{String(shortcutsOpen)}</div>;
}

function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route
            path="*"
            element={
              <>
                <div data-testid="child">child</div>
                <ShortcutProbe />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RootLayout", () => {
  beforeEach(() => {
    authState.user = null;
    navigationState.activeModule = null;
    hubKeyboardCfg.current = null;
    document.title = "";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the shell (skip-link, app-lock, overlay) and the child route", () => {
    renderAt("/");
    expect(screen.getByTestId("skip-link")).toBeInTheDocument();
    expect(screen.getByTestId("app-lock-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("does not boot nutrition/finyk sqlite hooks when logged out", () => {
    authState.user = null;
    renderAt("/");
    expect(useNutritionDualWriteBootMock).not.toHaveBeenCalled();
    expect(useNutritionSqliteReadBootMock).not.toHaveBeenCalled();
    expect(useFinykDualWriteBootMock).not.toHaveBeenCalled();
  });

  it("boots nutrition and finyk sqlite hooks when a user is present", () => {
    authState.user = { id: "u1" };
    renderAt("/");
    expect(useNutritionDualWriteBootMock).toHaveBeenCalled();
    expect(useNutritionSqliteReadBootMock).toHaveBeenCalled();
    expect(useFinykDualWriteBootMock).toHaveBeenCalled();
  });

  it("pins the document title for the active route", () => {
    renderAt("/chat");
    expect(document.title).toBe(titleForPath("/chat"));
  });

  it("skips document.title writes when the tab title is already correct", () => {
    const expected = titleForPath("/chat");
    document.title = expected;
    const titleSpy = vi.spyOn(document, "title", "set");
    renderAt("/chat");
    expect(titleSpy).not.toHaveBeenCalled();
    titleSpy.mockRestore();
  });

  it("disables app lock setup and finishes setup when cancel is pressed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByTestId("app-lock-cancel"));
    expect(setFlagMock).toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("opens hub search directly when already on the hub", () => {
    navigationState.activeModule = null;
    renderAt("/");
    hubKeyboardCfg.current!.onOpenSearch();
    expect(setSearchOpenMock).toHaveBeenCalledWith(true);
    expect(goToHubMock).not.toHaveBeenCalled();
  });

  it("returns to the hub before opening search from inside a module", () => {
    navigationState.activeModule = "finyk";
    renderAt("/finyk");
    hubKeyboardCfg.current!.onOpenSearch();
    expect(goToHubMock).toHaveBeenCalledTimes(1);
    expect(setSearchOpenMock).toHaveBeenCalledWith(true);
  });

  it("routes keyboard navigation chords to hub or module openers", () => {
    renderAt("/");
    hubKeyboardCfg.current!.onNavigate("hub");
    expect(goToHubMock).toHaveBeenCalledTimes(1);
    hubKeyboardCfg.current!.onNavigate("nutrition");
    expect(openModuleMock).toHaveBeenCalledWith("nutrition");
  });

  it("toggles shortcutsOpen via the keyboard-shortcuts callback", () => {
    renderAt("/");
    expect(screen.getByTestId("shortcuts-open")).toHaveTextContent("false");
    act(() => {
      hubKeyboardCfg.current!.onOpenShortcuts();
    });
    expect(screen.getByTestId("shortcuts-open")).toHaveTextContent("true");
  });
});
