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
let authStatus: "loading" | "authenticated" | "unauthenticated" =
  "authenticated";

vi.mock("../auth/AuthContext", () => ({
  useAuthOptional: () => ({ status: authStatus, user: null }),
}));

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
    usageLimit: 5,
    closePaywall: closePaywallMock,
    // Гейт §8 — мок мусить нести його форму, інакше HubChat падає на
    // читанні `pending`. Тримаємо закритим: цей сюїт про композицію,
    // поведінка гейта покрита у `chat/useChatSend.test.tsx`.
    confirmDestructive: {
      pending: null,
      request: vi.fn(),
      accept: vi.fn(),
      reject: vi.fn(),
    },
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
  PaywallModal: ({
    open,
    onClose,
    description,
  }: {
    open: boolean;
    onClose: () => void;
    description: string;
  }) => (
    <div data-testid="paywall" data-open={open}>
      <p data-testid="paywall-description">{description}</p>
      <button type="button" onClick={onClose}>
        close paywall
      </button>
    </div>
  ),
}));

describe("HubChat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authStatus = "authenticated";
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
    expect(screen.getByTestId("paywall-description")).toHaveTextContent(
      // Ліміт зрізали 15 → 5 у PR #464 (сервер), але ця копія лишилась
      // на 15 і почала брехати. Тест зробив свою роботу — спіймав правку.
      // 2026-08-23: одиниця виправлена на «запити». AI-5 рішення 1
      // (`docs/90-work/audits/2026-09-01-product-audit/findings.md`,
      // 2026-09-01) зробило хід з дією рівно одним запитом (раніше було
      // «коштує кілька») — копія оновлена разом із механікою.
      "Free-тариф має 5 запитів до AI на день",
    );

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
  // Regression (browser QA 2026-08-23): хаб запрошував незалогіненого гостя
  // «Відкрити AI-асистента», давав набрати питання — і відповідав
  // «Помилка: Доступ заборонено.». `/api/chat` за `requireSession()` лишається
  // як є; змінюється те, що бачить гість ДО того, як щось вкладе.
  it("замінює поле вводу на вхід в акаунт для незалогіненого гостя", () => {
    authStatus = "unauthenticated";
    render(<HubChat onClose={vi.fn()} />);

    expect(screen.queryByTestId("chat-composer")).toBeNull();
    const gate = screen.getByTestId("chat-auth-gate");
    expect(gate).toHaveTextContent("Асистент працює після входу");
    expect(screen.getByTestId("chat-auth-gate-signin")).toHaveAttribute(
      "href",
      "/sign-in",
    );
    // Історія лишається читабельною — гейт відбирає ввід, не читання.
    expect(screen.getByTestId("chat-body")).toBeInTheDocument();
  });

  it("не блимає гейтом, поки сесія ще резолвиться", () => {
    authStatus = "loading";
    render(<HubChat onClose={vi.fn()} />);

    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-auth-gate")).toBeNull();
  });
});
