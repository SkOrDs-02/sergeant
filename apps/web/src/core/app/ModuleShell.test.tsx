/** @vitest-environment jsdom */
/**
 * Shell smoke for `ModuleShell` — shared per-module route chrome (offline
 * banner, workout CTA, error boundary, hub modals, shortcuts modal).
 * Child route entries are covered in `modules/moduleLazyRoutes.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hubShell = {
  goToHub: vi.fn(),
  openModule: vi.fn(),
  moduleAnimClass: "module-enter",
  ui: { searchOpen: false, closeSearch: vi.fn() },
  shortcutsOpen: false,
  onCloseShortcuts: vi.fn(),
};

vi.mock("./HubShellContext", () => ({
  useHubShell: () => hubShell,
}));
vi.mock("../lib/useModuleRouteLoader", () => ({
  useModuleRouteLoader: vi.fn(),
}));
vi.mock("./OfflineBanner", () => ({
  OfflineBanner: () => <div data-testid="offline-banner" />,
}));
vi.mock("./ActiveWorkoutBanner", () => ({
  ActiveWorkoutBanner: () => <div data-testid="workout-banner" />,
}));
vi.mock("./HubModals", () => ({
  HubModals: ({ searchOpen }: { searchOpen: boolean }) =>
    searchOpen ? <div data-testid="hub-modals-open" /> : null,
}));
vi.mock("../ModuleErrorBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));
vi.mock("../lib/lazyImport", () => ({
  lazyImport: (
    _factory: unknown,
    name: string,
  ): React.ComponentType<{ open: boolean; onClose: () => void }> => {
    const Stub = ({ open, onClose }: { open: boolean; onClose: () => void }) =>
      open ? (
        <div data-testid="shortcuts-modal">
          <button type="button" onClick={onClose}>
            close-shortcuts
          </button>
        </div>
      ) : null;
    Stub.displayName = name;
    return Stub;
  },
}));

import { ModuleShell } from "./ModuleShell";

describe("ModuleShell — shell smoke", () => {
  afterEach(() => {
    cleanup();
    hubShell.ui.searchOpen = false;
    hubShell.shortcutsOpen = false;
    vi.clearAllMocks();
  });

  it("renders children inside a main landmark for non-routine modules", () => {
    render(
      <ModuleShell moduleId="finyk">
        <div data-testid="child">finyk-body</div>
      </ModuleShell>,
    );

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByTestId("workout-banner")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("uses a div landmark for routine to avoid double-main", () => {
    render(
      <ModuleShell moduleId="routine">
        <div data-testid="routine-child">routine-body</div>
      </ModuleShell>,
    );

    expect(screen.queryByRole("main")).toBeNull();
    expect(document.getElementById("main")).toHaveAttribute("id", "main");
    expect(screen.getByTestId("routine-child")).toBeInTheDocument();
  });

  it("hides the active-workout banner inside fizruk", () => {
    render(
      <ModuleShell moduleId="fizruk">
        <div>fizruk-body</div>
      </ModuleShell>,
    );

    expect(screen.queryByTestId("workout-banner")).toBeNull();
  });

  it("wires HubModals searchOpen from hub shell ui state", () => {
    hubShell.ui.searchOpen = true;
    render(
      <ModuleShell moduleId="nutrition">
        <div>nutrition-body</div>
      </ModuleShell>,
    );

    expect(screen.getByTestId("hub-modals-open")).toBeInTheDocument();
  });

  it("lazy-mounts keyboard shortcuts when shortcutsOpen is true", async () => {
    hubShell.shortcutsOpen = true;
    const user = userEvent.setup();
    render(
      <ModuleShell moduleId="finyk">
        <div>body</div>
      </ModuleShell>,
    );

    expect(screen.getByTestId("shortcuts-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "close-shortcuts" }));
    expect(hubShell.onCloseShortcuts).toHaveBeenCalledTimes(1);
  });
});
