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
  });

  it("clears live region text when not loading", () => {
    const { container } = renderBody({ loading: false });
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toHaveTextContent("");
  });
});
