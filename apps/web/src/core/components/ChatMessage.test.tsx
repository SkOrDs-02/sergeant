// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for ChatMessage — user vs assistant rendering,
 * speak button, action cards, typing indicator.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import type { ChatMessage as ChatMessageData } from "../lib/hubChatUtils";

vi.mock("../lib/hubChatSpeech", () => ({
  speak: vi.fn(),
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock("@shared/components/AssistantMessageBody", () => ({
  AssistantMessageBody: ({ text }: { text: string }) => (
    <span data-testid="assistant-body">{text}</span>
  ),
}));

vi.mock("../hub/chat/components/DataResultCard", () => ({
  DataResultCard: ({
    title,
    toolName,
  }: {
    title: string;
    toolName: string;
  }) => <div data-testid={`data-card-${toolName}`}>{title}</div>,
}));

import { speak } from "../lib/hubChatSpeech";

function makeMessage(
  overrides: Partial<ChatMessageData> = {},
): ChatMessageData {
  return {
    id: "msg-1",
    role: "user",
    text: "Hello",
    cards: [],
    ...overrides,
  } as ChatMessageData;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatMessage — user messages", () => {
  it("renders user text directly (not via AssistantMessageBody)", () => {
    render(
      <ChatMessage message={makeMessage({ role: "user", text: "Привіт" })} />,
    );
    expect(screen.getByText("Привіт")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-body")).not.toBeInTheDocument();
  });

  it("does not render the speak button for user messages", () => {
    render(
      <ChatMessage
        message={makeMessage({ role: "user", text: "Long enough text here" })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Озвучити відповідь" }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatMessage — assistant messages", () => {
  it("renders assistant text via AssistantMessageBody", () => {
    render(
      <ChatMessage
        message={makeMessage({ role: "assistant", text: "Відповідь" })}
      />,
    );
    expect(screen.getByTestId("assistant-body")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-body")).toHaveTextContent("Відповідь");
  });

  it("renders speak button for assistant messages with text > 3 chars", () => {
    render(
      <ChatMessage
        message={makeMessage({ role: "assistant", text: "Long answer text" })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Озвучити відповідь" }),
    ).toBeInTheDocument();
  });

  it("does NOT render speak button when text is too short (≤3 chars)", () => {
    render(
      <ChatMessage message={makeMessage({ role: "assistant", text: "Hi" })} />,
    );
    expect(
      screen.queryByRole("button", { name: "Озвучити відповідь" }),
    ).not.toBeInTheDocument();
  });

  it("clicking speak button calls speak() and onSpeak callback", () => {
    const onSpeak = vi.fn();
    render(
      <ChatMessage
        message={makeMessage({ role: "assistant", text: "Long answer text" })}
        onSpeak={onSpeak}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Озвучити відповідь" }));
    expect(speak).toHaveBeenCalledWith("Long answer text");
    expect(onSpeak).toHaveBeenCalledTimes(1);
  });

  it("renders ActionCard for regular (non-data, non-risky) cards", () => {
    const card = {
      id: "card-1",
      toolName: "add_habit",
      title: "Звичку додано",
      summary: "Щоденний біг 30 хв",
      status: "completed" as const,
      risky: false,
      data: undefined,
      icon: "check",
      module: "routine" as const,
    };
    render(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Зроблено",
          cards: [card],
        })}
      />,
    );
    expect(
      screen.getByTestId("chat-action-card-add_habit"),
    ).toBeInTheDocument();
  });

  it("renders DataResultCard when card.data is truthy", () => {
    const card = {
      id: "card-2",
      toolName: "aggregate_spending",
      title: "Витрати",
      summary: "500 грн",
      status: "completed" as const,
      risky: false,
      data: true,
      icon: "check",
      module: "finyk" as const,
    };
    render(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Ось дані",
          cards: [card],
        })}
      />,
    );
    expect(
      screen.getByTestId("data-card-aggregate_spending"),
    ).toBeInTheDocument();
  });

  it("renders ConfirmCard for risky completed cards without data", () => {
    const card = {
      id: "card-3",
      toolName: "delete_habit",
      title: "Звичку видалено",
      summary: "Назавжди видалено звичку 'Біг'",
      status: "completed" as const,
      risky: true,
      data: undefined,
      icon: "alert",
      module: "routine" as const,
    };
    render(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Готово",
          cards: [card],
        })}
      />,
    );
    expect(
      screen.getByTestId("chat-confirm-card-delete_habit"),
    ).toBeInTheDocument();
  });
});

describe("TypingIndicator", () => {
  it("renders with correct aria-label", () => {
    render(<TypingIndicator />);
    expect(
      screen.getByRole("status", { name: "Асистент набирає відповідь" }),
    ).toBeInTheDocument();
  });
});
