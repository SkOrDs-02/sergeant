/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HubChat from "./HubChat";

const storageBootMock = vi.fn();
const setHistoryOpenMock = vi.fn();
const setDetailsOpenMock = vi.fn();
const createSessionMock = vi.fn();
const selectSessionMock = vi.fn();
const deleteSessionMock = vi.fn();
const setMessagesMock = vi.fn();
const setInputMock = vi.fn();
const setSpeakingMock = vi.fn();
const sendMock = vi.fn<(_: string) => Promise<void>>(() => Promise.resolve());
const cancelInFlightMock = vi.fn();
const closePaywallMock = vi.fn();
const focusInputMock = vi.fn();

vi.mock("./chat/useHubChatStorageBoot", () => ({
  useHubChatStorageBoot: () => storageBootMock(),
}));

vi.mock("./chat/useChatSessions", () => ({
  useChatSessions: () => ({
    sessions: [{ id: "s1", title: "Session" }],
    activeId: "s1",
    messages: [
      { id: "u1", role: "user", text: "hello" },
      { id: "a1", role: "assistant", text: "hi" },
      { id: "system", role: "system", text: "ignored" },
    ],
    setMessages: setMessagesMock,
    historyOpen: true,
    setHistoryOpen: setHistoryOpenMock,
    detailsOpen: false,
    setDetailsOpen: setDetailsOpenMock,
    handleCreateSession: createSessionMock,
    handleSelectSession: selectSessionMock,
    handleDeleteSession: deleteSessionMock,
  }),
}));

vi.mock("./chat/useChatSend", () => ({
  useChatSend: () => ({
    input: "draft",
    setInput: setInputMock,
    loading: true,
    speaking: false,
    setSpeaking: setSpeakingMock,
    online: true,
    hasData: true,
    contextState: "ready",
    activeModule: "finyk",
    send: sendMock,
    cancelInFlight: cancelInFlightMock,
    paywallOpen: true,
    closePaywall: closePaywallMock,
    sendRef: { current: null },
    focusInputRef: { current: focusInputMock },
  }),
}));

vi.mock("./chat/HubChatHeader", () => ({
  HubChatHeader: ({
    sessionInfo,
    sessionsCount,
    onDetailsOpenChange,
    onOpenHistory,
    onClearChat,
    onClose,
  }: {
    sessionInfo: { historyCount: number; chars: number };
    sessionsCount: number;
    onDetailsOpenChange: (open: boolean) => void;
    onOpenHistory: () => void;
    onClearChat: () => void;
    onClose: () => void;
  }) => (
    <header data-testid="chat-header">
      <span data-testid="session-info">
        {sessionInfo.historyCount}:{sessionInfo.chars}:{sessionsCount}
      </span>
      <button type="button" onClick={() => onDetailsOpenChange(true)}>
        details
      </button>
      <button type="button" onClick={onOpenHistory}>
        history
      </button>
      <button type="button" onClick={onClearChat}>
        clear
      </button>
      <button type="button" onClick={onClose}>
        close
      </button>
    </header>
  ),
}));

vi.mock("./chat/HubChatBody", () => ({
  HubChatBody: ({
    onSpeak,
    onCancel,
    onPickSuggestion,
  }: {
    onSpeak: () => void;
    onCancel: () => void;
    onPickSuggestion: (text: string) => void;
  }) => (
    <section data-testid="chat-body">
      <button type="button" onClick={onSpeak}>
        speak
      </button>
      <button type="button" onClick={onCancel}>
        cancel
      </button>
      <button type="button" onClick={() => onPickSuggestion("suggested")}>
        suggestion
      </button>
    </section>
  ),
}));

vi.mock("./chat/HubChatComposer", () => ({
  HubChatComposer: ({
    onSend,
    onHelp,
    setInput,
    setSpeaking,
  }: {
    onSend: (prompt: string) => void;
    onHelp: () => void;
    setInput: (value: string) => void;
    setSpeaking: (value: boolean) => void;
  }) => (
    <footer data-testid="chat-composer">
      <button type="button" onClick={() => onSend("manual prompt")}>
        send
      </button>
      <button type="button" onClick={onHelp}>
        help
      </button>
      <button type="button" onClick={() => setInput("typed")}>
        type
      </button>
      <button type="button" onClick={() => setSpeaking(false)}>
        stop speaking
      </button>
    </footer>
  ),
}));

vi.mock("./HubChatHistoryDrawer", () => ({
  HubChatHistoryDrawer: ({
    open,
    onClose,
    onSelect,
    onCreate,
    onDelete,
  }: {
    open: boolean;
    onClose: () => void;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onDelete: (id: string) => void;
  }) => (
    <aside data-testid="history-drawer" data-open={open}>
      <button type="button" onClick={onClose}>
        close history
      </button>
      <button type="button" onClick={() => onSelect("s2")}>
        select session
      </button>
      <button type="button" onClick={onCreate}>
        create session
      </button>
      <button type="button" onClick={() => onDelete("s1")}>
        delete session
      </button>
    </aside>
  ),
}));

vi.mock("../billing/PaywallModal", () => ({
  PaywallModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="paywall" data-open={open}>
      <button type="button" onClick={onClose}>
        close paywall
      </button>
    </div>
  ),
}));

describe("HubChat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("composes chat state and forwards child callbacks", async () => {
    const onClose = vi.fn();
    render(
      <HubChat
        onClose={onClose}
        initialMessage="start"
        autoSendInitial
        onOpenCatalogue={vi.fn()}
      />,
    );

    expect(storageBootMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-info")).toHaveTextContent("2:7:1");
    expect(screen.getByTestId("history-drawer")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("paywall")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByText("details"));
    fireEvent.click(screen.getByText("history"));
    fireEvent.click(screen.getByText("clear"));
    fireEvent.click(screen.getByText("close"));
    fireEvent.click(screen.getByText("speak"));
    fireEvent.click(screen.getByText("cancel"));
    fireEvent.click(screen.getByText("suggestion"));
    fireEvent.click(screen.getByText("send"));
    fireEvent.click(screen.getByText("help"));
    fireEvent.click(screen.getByText("type"));
    fireEvent.click(screen.getByText("stop speaking"));
    fireEvent.click(screen.getByText("close history"));
    fireEvent.click(screen.getByText("select session"));
    fireEvent.click(screen.getByText("create session"));
    fireEvent.click(screen.getByText("delete session"));
    fireEvent.click(screen.getByText("close paywall"));

    await vi.runAllTimersAsync();

    expect(setDetailsOpenMock).toHaveBeenCalledWith(true);
    expect(setHistoryOpenMock).toHaveBeenCalledWith(true);
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setSpeakingMock).toHaveBeenCalledWith(true);
    expect(cancelInFlightMock).toHaveBeenCalledTimes(1);
    expect(setInputMock).toHaveBeenCalledWith("suggested");
    expect(focusInputMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith("manual prompt");
    expect(sendMock).toHaveBeenCalledWith("/help");
    expect(setInputMock).toHaveBeenCalledWith("typed");
    expect(setSpeakingMock).toHaveBeenCalledWith(false);
    expect(setHistoryOpenMock).toHaveBeenCalledWith(false);
    expect(selectSessionMock).toHaveBeenCalledWith("s2");
    expect(deleteSessionMock).toHaveBeenCalledWith("s1");
    expect(closePaywallMock).toHaveBeenCalledTimes(1);
  });
});
