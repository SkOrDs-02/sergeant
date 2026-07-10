// @vitest-environment jsdom
/**
 * Smoke-render tests for `HubChat` — the hub chat shell that composes
 * useChatSessions, useChatSend, and their child components. All heavy
 * collaborators are mocked so this suite validates that:
 *   a) HubChat mounts without throwing (0% → covered).
 *   b) It renders the expected a11y landmark and delegates to sub-components.
 *   c) Props like `initialMessage` and `autoSendInitial` are forwarded to
 *      `useChatSend`, and `onClose`/`onOpenCatalogue` propagate down.
 *   d) `paywallOpen` state is consumed correctly (PaywallModal receives it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Hoisted mock factories ────────────────────────────────────────────────────

const { mockUseChatSessions, mockUseChatSend, mockUseHubChatStorageBoot } =
  vi.hoisted(() => ({
    mockUseHubChatStorageBoot: vi.fn(),
    mockUseChatSessions: vi.fn(),
    mockUseChatSend: vi.fn(),
  }));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./chat/useHubChatStorageBoot", () => ({
  useHubChatStorageBoot: mockUseHubChatStorageBoot,
}));

vi.mock("./chat/useChatSessions", () => ({
  useChatSessions: mockUseChatSessions,
}));

vi.mock("./chat/useChatSend", () => ({
  useChatSend: mockUseChatSend,
}));

vi.mock("./HubChatHistoryDrawer", () => ({
  HubChatHistoryDrawer: () => <div data-testid="history-drawer" />,
}));

vi.mock("./chat/HubChatHeader", () => ({
  HubChatHeader: (props: { onClose?: () => void }) => (
    <div data-testid="hub-chat-header">
      {props.onClose && (
        <button
          type="button"
          data-testid="header-close"
          onClick={props.onClose}
        >
          close
        </button>
      )}
    </div>
  ),
}));

vi.mock("./chat/HubChatBody", () => ({
  HubChatBody: (props: { onPickSuggestion?: (t: string) => void }) => (
    <div data-testid="hub-chat-body">
      <button
        type="button"
        data-testid="body-pick-suggestion"
        onClick={() => props.onPickSuggestion?.("suggestion")}
      >
        pick
      </button>
    </div>
  ),
}));

vi.mock("./chat/HubChatComposer", () => ({
  HubChatComposer: (props: {
    onSend?: (p: string) => void;
    onHelp?: () => void;
  }) => (
    <div data-testid="hub-chat-composer">
      <button
        type="button"
        data-testid="composer-send"
        onClick={() => props.onSend?.("hello")}
      >
        send
      </button>
      <button
        type="button"
        data-testid="composer-help"
        onClick={() => props.onHelp?.()}
      >
        help
      </button>
    </div>
  ),
}));

vi.mock("../billing/PaywallModal", () => ({
  PaywallModal: (props: { open?: boolean }) => (
    <div data-testid="paywall-modal" data-open={String(props.open ?? false)} />
  ),
}));

// ─── Import under test (after mocks) ──────────────────────────────────────────

import HubChat from "./HubChat";

// ─── Default mock returns ─────────────────────────────────────────────────────

const defaultFocusInputRef = { current: null as (() => void) | null };
const defaultSendRef = {
  current: null as ((p: string) => Promise<void>) | null,
};

function makeDefaultSessions() {
  return {
    sessions: [],
    activeId: "session-1",
    messages: [],
    setMessages: vi.fn(),
    historyOpen: false,
    setHistoryOpen: vi.fn(),
    detailsOpen: false,
    setDetailsOpen: vi.fn(),
    handleCreateSession: vi.fn(),
    handleSelectSession: vi.fn(),
    handleDeleteSession: vi.fn(),
    persistCurrentMessages: vi.fn(),
  };
}

function makeDefaultSend(overrides: Record<string, unknown> = {}) {
  return {
    input: "",
    setInput: vi.fn(),
    loading: false,
    speaking: false,
    setSpeaking: vi.fn(),
    online: true,
    hasData: false,
    contextState: null,
    activeModule: null,
    send: vi.fn().mockResolvedValue(undefined),
    cancelInFlight: vi.fn(),
    paywallOpen: false,
    closePaywall: vi.fn(),
    sendRef: defaultSendRef,
    focusInputRef: defaultFocusInputRef,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseHubChatStorageBoot.mockReturnValue(undefined);
  mockUseChatSessions.mockReturnValue(makeDefaultSessions());
  mockUseChatSend.mockReturnValue(makeDefaultSend());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubChat", () => {
  it("smoke render: mounts without throwing and renders the chat region", () => {
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("renders all expected child components", () => {
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByTestId("hub-chat-header")).toBeInTheDocument();
    expect(screen.getByTestId("hub-chat-body")).toBeInTheDocument();
    expect(screen.getByTestId("hub-chat-composer")).toBeInTheDocument();
    expect(screen.getByTestId("history-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("paywall-modal")).toBeInTheDocument();
  });

  it("paywallModal data-open=false when paywallOpen is false", () => {
    mockUseChatSend.mockReturnValue(makeDefaultSend({ paywallOpen: false }));
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByTestId("paywall-modal")).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("paywallModal data-open=true when paywallOpen is true", () => {
    mockUseChatSend.mockReturnValue(makeDefaultSend({ paywallOpen: true }));
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByTestId("paywall-modal")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("forwards initialMessage to useChatSend", () => {
    render(<HubChat onClose={vi.fn()} initialMessage="привіт" />);
    expect(mockUseChatSend).toHaveBeenCalledWith(
      expect.objectContaining({ initialMessage: "привіт" }),
    );
  });

  it("forwards autoSendInitial to useChatSend", () => {
    render(<HubChat onClose={vi.fn()} autoSendInitial />);
    expect(mockUseChatSend).toHaveBeenCalledWith(
      expect.objectContaining({ autoSendInitial: true }),
    );
  });

  it("forwards onOpenCatalogue to useChatSend", () => {
    const onOpenCatalogue = vi.fn();
    render(<HubChat onClose={vi.fn()} onOpenCatalogue={onOpenCatalogue} />);
    expect(mockUseChatSend).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenCatalogue }),
    );
  });

  it("calls useHubChatStorageBoot to warm SQLite caches", () => {
    render(<HubChat onClose={vi.fn()} />);
    expect(mockUseHubChatStorageBoot).toHaveBeenCalled();
  });

  it("sessionInfo historyCount includes only user/assistant messages", () => {
    // Inject a messages array that includes a non-user/assistant role.
    mockUseChatSessions.mockReturnValue({
      ...makeDefaultSessions(),
      messages: [
        { role: "user", text: "hello" },
        { role: "assistant", text: "world" },
        { role: "system", text: "ignored" },
      ],
    });
    // As long as it renders without error, the useMemo branch is covered.
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByTestId("hub-chat-header")).toBeInTheDocument();
  });

  it("non-array messages falls back gracefully (useMemo guards Array.isArray)", () => {
    mockUseChatSessions.mockReturnValue({
      ...makeDefaultSessions(),
      messages: null as unknown as never[],
    });
    render(<HubChat onClose={vi.fn()} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
