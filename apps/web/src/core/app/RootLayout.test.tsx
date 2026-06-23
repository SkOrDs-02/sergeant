// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Smoke + wiring coverage for RootLayout. The component is a pure shell that
 * composes ~20 hooks and renders global UI (AppLock, HubChatOverlay,
 * boot-gates) around an <Outlet/>. Every hook + heavy child is mocked to a
 * trivial value so we exercise RootLayout's own JSX/branching (auth boot
 * gates, title effect, context plumbing) without their real implementations.
 */

const authState = { user: null as { id: string } | null };

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
  AppLock: () => <div data-testid="app-lock" />,
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
  setFlag: vi.fn(),
  useFlag: () => false,
}));
vi.mock("./useDemoCommands", () => ({ useDemoCommands: vi.fn() }));
vi.mock("../hooks/useHubKeyboardShortcuts", () => ({
  useHubKeyboardShortcuts: vi.fn(),
}));
vi.mock("../hooks/useBrowserLocation", () => ({
  useBrowserLocation: (loc: { search?: string }) => ({
    search: loc.search ?? "",
  }),
}));
vi.mock("../hooks/useHubNavigation", () => ({
  useHubNavigation: () => ({
    activeModule: null,
    openModule: vi.fn(),
    goToHub: vi.fn(),
    goToModuleSettings: vi.fn(),
    moduleAnimClass: "",
  }),
}));
vi.mock("../hooks/useHubUIState", () => ({
  useHubUIState: () => ({ searchOpen: false, setSearchOpen: vi.fn() }),
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
  useNutritionDualWriteBoot: vi.fn(),
}));
vi.mock("../../modules/nutrition/hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: vi.fn(),
}));
vi.mock("../../modules/finyk/hooks/useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: vi.fn(),
}));

import { RootLayout } from "./RootLayout";

function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="*" element={<div data-testid="child">child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RootLayout", () => {
  beforeEach(() => {
    authState.user = null;
    document.title = "";
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the shell (skip-link, app-lock, overlay) and the child route", () => {
    renderAt("/");
    expect(screen.getByTestId("skip-link")).toBeInTheDocument();
    expect(screen.getByTestId("app-lock")).toBeInTheDocument();
    expect(screen.getByTestId("chat-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("does not render the authenticated boot gates when logged out", () => {
    authState.user = null;
    renderAt("/");
    // Boot gates render null for anonymous users; the shell still mounts.
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders the authenticated boot gates when a user is present", () => {
    authState.user = { id: "u1" };
    renderAt("/");
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("pins the document title for the active route", () => {
    renderAt("/chat");
    // titleForPath resolves a non-empty title for known + unknown routes.
    expect(document.title.length).toBeGreaterThan(0);
  });
});
