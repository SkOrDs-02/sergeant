/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HubChatBodyProps } from "./HubChatBody";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

vi.mock("../../components/ChatMessage", () => ({
  ChatMessage: ({ message }: { message: { id: string; text: string } }) => (
    <div data-testid={`msg-${message.id}`}>{message.text}</div>
  ),
  TypingIndicator: () => <div data-testid="typing-indicator" />,
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span data-testid="icon" />,
}));

vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./ChatEmpty", () => ({
  ChatEmpty: ({
    onPickSuggestion,
  }: {
    onPickSuggestion: (s: string) => void;
  }) => (
    <div data-testid="chat-empty">
      <button onClick={() => onPickSuggestion("Яка моя сума витрат?")}>
        suggestion
      </button>
    </div>
  ),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { HubChatBody } from "./HubChatBody";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Msg = HubChatBodyProps["messages"][number];

function msg(id: string, role: "user" | "assistant", text: string): Msg {
  return { id, role, text } as unknown as Msg;
}

function renderBody(overrides: Partial<HubChatBodyProps> = {}) {
  const props: HubChatBodyProps = {
    messages: [],
    loading: false,
    onSpeak: vi.fn(),
    onCancel: vi.fn(),
    onPickSuggestion: vi.fn(),
    ...overrides,
  };
  return { ...render(<HubChatBody {...props} />), props };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubChatBody", () => {
  afterEach(() => cleanup());

  // Регресія з browser-QA 2026-09-02: розкриття «це AI» (EU AI Act ст. 50(1))
  // жило всередині `ChatEmpty`, а `normalizeStoredMessages` підставляє
  // привітальну репліку в кожну порожню сесію — тож порожній стан недосяжний,
  // і розкриття не показувалось ЖОДНОГО разу. Перевіряємо саме той стан, який
  // бачить реальний користувач: у стрічці вже є привітання.
  it("shows the AI disclosure even when the greeting message is present", () => {
    renderBody({
      messages: [
        msg("greet", "assistant", "Привіт! Я твій особистий асистент."),
      ],
    });
    expect(screen.getByText(/Відповідає AI, а не людина/)).toBeInTheDocument();
  });

  it("shows the AI disclosure while the assistant is answering", () => {
    renderBody({ messages: [msg("1", "user", "Питання")], loading: true });
    expect(screen.getByText(/Відповідає AI, а не людина/)).toBeInTheDocument();
  });

  // Регресія з browser-QA 2026-09-02: стрічка лежить у статичному
  // `role="region"`, а єдина жива область казала лише «Асистент відповідає…».
  // Тобто незрячий користувач чув, що відповідь іде, і не чув, ЯКА вона.
  it("announces the finished assistant reply to screen readers", () => {
    renderBody({
      messages: [
        msg("1", "user", "Скільки я витратив?"),
        msg("2", "assistant", "Цього тижня 1 240 гривень."),
      ],
      loading: false,
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Цього тижня 1 240 гривень.");
  });

  it("announces progress, not content, while the reply is streaming", () => {
    renderBody({
      messages: [msg("1", "user", "Питання")],
      loading: true,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Асистент відповідає…",
    );
  });

  it("does not announce a failure through the reply region", () => {
    const failure = {
      ...msg("1", "assistant", "Асистент зараз недоступний."),
      error: true,
    } as unknown as Msg;
    renderBody({ messages: [failure], loading: false });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("renders ChatEmpty when there are no messages and not loading", () => {
    renderBody({ messages: [], loading: false });
    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
  });

  it("does not render ChatEmpty when loading with no messages", () => {
    renderBody({ messages: [], loading: true });
    expect(screen.queryByTestId("chat-empty")).not.toBeInTheDocument();
  });

  it("renders all provided messages", () => {
    renderBody({
      messages: [msg("1", "user", "Привіт"), msg("2", "assistant", "Вітаю")],
    });
    expect(screen.getByTestId("msg-1")).toHaveTextContent("Привіт");
    expect(screen.getByTestId("msg-2")).toHaveTextContent("Вітаю");
  });

  it("shows TypingIndicator and cancel pill while loading", () => {
    renderBody({ messages: [], loading: true });
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Скасувати поточний запит/i }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    renderBody({ messages: [], loading: true, onCancel });
    fireEvent.click(
      screen.getByRole("button", { name: /Скасувати поточний запит/i }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides cancel pill when not loading", () => {
    renderBody({ messages: [msg("1", "user", "Привіт")], loading: false });
    expect(
      screen.queryByRole("button", { name: /Скасувати поточний запит/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onPickSuggestion from ChatEmpty callback", () => {
    const onPickSuggestion = vi.fn();
    renderBody({ messages: [], loading: false, onPickSuggestion });
    fireEvent.click(screen.getByText("suggestion"));
    expect(onPickSuggestion).toHaveBeenCalledWith("Яка моя сума витрат?");
  });

  it("sets aria-busy when loading", () => {
    const { container } = renderBody({ loading: true });
    const scrollable = container.querySelector('[aria-busy="true"]');
    expect(scrollable).toBeInTheDocument();
  });

  it("has aria-live polite region for screen reader announcements", () => {
    const { container } = renderBody({ loading: true });
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toHaveTextContent("Асистент відповідає…");
    const scrollContainer = container.querySelector('[aria-busy="true"]');
    expect(scrollContainer).not.toHaveAttribute("aria-live");
  });

  it("clears live region text when not loading", () => {
    const { container } = renderBody({ loading: false });
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toHaveTextContent("");
  });
});
