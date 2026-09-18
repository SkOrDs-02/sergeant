// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for ChatMessage — user vs assistant rendering,
 * speak button, action cards, typing indicator.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import type { ChatMessage as ChatMessageData } from "../lib/hubChatUtils";
import type { ChatActionCardModule } from "../lib/hubChatActionCards";

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

/**
 * `ModuleLink` під карткою — це `<Link>`, тож без роутер-контексту падає
 * весь файл, а не лише картковi кейси.
 */
function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatMessage — user messages", () => {
  it("renders user text directly (not via AssistantMessageBody)", () => {
    renderInRouter(
      <ChatMessage message={makeMessage({ role: "user", text: "Привіт" })} />,
    );
    expect(screen.getByText("Привіт")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-body")).not.toBeInTheDocument();
  });

  it("does not render the speak button for user messages", () => {
    renderInRouter(
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
    renderInRouter(
      <ChatMessage
        message={makeMessage({ role: "assistant", text: "Відповідь" })}
      />,
    );
    expect(screen.getByTestId("assistant-body")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-body")).toHaveTextContent("Відповідь");
  });

  it("renders speak button for assistant messages with text > 3 chars", () => {
    renderInRouter(
      <ChatMessage
        message={makeMessage({ role: "assistant", text: "Long answer text" })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Озвучити відповідь" }),
    ).toBeInTheDocument();
  });

  it("does NOT render speak button when text is too short (≤3 chars)", () => {
    renderInRouter(
      <ChatMessage message={makeMessage({ role: "assistant", text: "Hi" })} />,
    );
    expect(
      screen.queryByRole("button", { name: "Озвучити відповідь" }),
    ).not.toBeInTheDocument();
  });

  it("clicking speak button calls speak() and onSpeak callback", () => {
    const onSpeak = vi.fn();
    renderInRouter(
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
    renderInRouter(
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
    renderInRouter(
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
    renderInRouter(
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

/**
 * Регресія: `card.module` на вебі не читав ніхто, тож усі картки вели в
 * нікуди й виглядали однаково незалежно від теми запиту. Мобільний клієнт
 * будував deep link із того самого поля.
 */
describe("ChatMessage — посилання на модуль під карткою", () => {
  function cardFor(module: ChatActionCardModule) {
    return {
      id: `card-${module}`,
      toolName: "log_meal",
      title: "Записано",
      summary: "Вівсянка 300 ккал",
      status: "completed" as const,
      risky: false,
      data: undefined,
      icon: "check",
      module,
    };
  }

  it.each<[ChatActionCardModule, string, string]>([
    ["finyk", "/finyk", "Фінік"],
    ["fizruk", "/fizruk", "Фізрук"],
    ["routine", "/routine", "Рутина"],
    ["nutrition", "/nutrition", "Їжа"],
  ])("%s веде на %s", (module, href, label) => {
    renderInRouter(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Готово",
          cards: [cardFor(module)],
        })}
      />,
    );

    const link = screen.getByTestId(`chat-card-link-${module}`);
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveTextContent(label);
  });

  it("кросмодульна картка посилання не отримує — чат уже в хабі", () => {
    renderInRouter(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Готово",
          cards: [cardFor("hub")],
        })}
      />,
    );

    expect(screen.queryByTestId("chat-card-link-hub")).not.toBeInTheDocument();
  });

  it("data-картка теж отримує посилання", () => {
    renderInRouter(
      <ChatMessage
        message={makeMessage({
          role: "assistant",
          text: "Ось дані",
          cards: [
            { ...cardFor("finyk"), toolName: "aggregate_spending", data: true },
          ],
        })}
      />,
    );

    expect(screen.getByTestId("chat-card-link-finyk")).toBeInTheDocument();
  });
});

describe("TypingIndicator", () => {
  it("renders with correct aria-label", () => {
    renderInRouter(<TypingIndicator />);
    expect(
      screen.getByRole("status", { name: "Асистент набирає відповідь" }),
    ).toBeInTheDocument();
  });
});
