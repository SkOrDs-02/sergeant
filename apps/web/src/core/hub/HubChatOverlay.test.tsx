/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const closeChatMock = vi.fn();
const overlayState = {
  open: false,
  initialMessage: "",
  autoSendInitial: false,
  openChat: vi.fn(),
  closeChat: closeChatMock,
};

vi.mock("./useHubChatOverlay", () => ({
  useHubChatOverlay: () => overlayState,
}));

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    onClose,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <button onClick={onClose} aria-label="Закрити">
          close
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../app/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

vi.mock("../lib/lazyImport", () => ({
  lazyDefault: (
    factory: () => Promise<{ default: React.ComponentType<unknown> }>,
  ) => {
    // Return a synchronous stub component
    const Stub = (props: Record<string, unknown>) => (
      <div data-testid="hub-chat-stub" data-props={JSON.stringify(props)} />
    );
    Stub.displayName = "LazyHubChat";
    // Attach preload to satisfy React.lazy interface
    void factory;
    return Stub;
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { HubChatOverlay } from "./HubChatOverlay";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderOverlay(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HubChatOverlay />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubChatOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayState.open = false;
    overlayState.initialMessage = "";
    overlayState.autoSendInitial = false;
  });

  afterEach(() => cleanup());

  it("renders nothing when overlay is closed", () => {
    overlayState.open = false;
    renderOverlay();
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("renders Sheet with HubChat when overlay is open", () => {
    overlayState.open = true;
    renderOverlay();
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });

  it("calls closeChat when Sheet's onClose fires", () => {
    overlayState.open = true;
    renderOverlay();
    act(() => {
      screen.getByRole("button", { name: "Закрити" }).click();
    });
    expect(closeChatMock).toHaveBeenCalledTimes(1);
  });
});
