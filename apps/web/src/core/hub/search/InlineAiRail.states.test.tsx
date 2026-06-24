/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InlineAiRail } from "./InlineAiRail";
import type { InlineAiState } from "./useInlineAiRail";

function renderRail(state: InlineAiState) {
  const onRetry = vi.fn();
  const onCancel = vi.fn();
  const onOpenInChat = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <InlineAiRail
      state={state}
      onRetry={onRetry}
      onCancel={onCancel}
      onOpenInChat={onOpenInChat}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onRetry, onCancel, onOpenInChat, onDismiss };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InlineAiRail — loading state", () => {
  it("shows the spinner label and cancels", () => {
    const { onCancel } = renderRail({ status: "loading", question: "кава" });
    expect(screen.getByText("AI шукає відповідь")).toBeInTheDocument();
    expect(screen.getByText("Думаю…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onDismiss from the close button", () => {
    const { onDismiss } = renderRail({ status: "loading", question: "кава" });
    fireEvent.click(screen.getByRole("button", { name: "Закрити відповідь" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("InlineAiRail — success state", () => {
  const base: InlineAiState = {
    status: "success",
    question: "скільки витрат",
    answer: "Ти витратив 500 грн",
    hasToolCalls: false,
    truncated: false,
  };

  it("renders the answer and wires open-in-chat + retry", () => {
    const { onOpenInChat, onRetry } = renderRail(base);
    expect(screen.getByText("Ти витратив 500 грн")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Відкрити в чаті/ }));
    expect(onOpenInChat).toHaveBeenCalledWith("скільки витрат");
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(onRetry).toHaveBeenCalledWith("скільки витрат");
  });

  it("shows the tool-call confirmation hint when hasToolCalls is true", () => {
    renderRail({ ...base, hasToolCalls: true });
    expect(
      screen.getByText("Дія потребує підтвердження в чаті"),
    ).toBeInTheDocument();
    // Truncated hint is suppressed while a tool call is pending.
    expect(
      screen.queryByText("Повна відповідь — у чаті"),
    ).not.toBeInTheDocument();
  });

  it("shows the truncated hint only when truncated and no tool calls", () => {
    renderRail({ ...base, truncated: true });
    expect(screen.getByText("Повна відповідь — у чаті")).toBeInTheDocument();
  });
});

describe("InlineAiRail — aborted state", () => {
  it("offers a re-ask action", () => {
    const { onRetry } = renderRail({ status: "aborted", question: "кава" });
    expect(screen.getByText("Запит скасовано")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Запитати знову" }));
    expect(onRetry).toHaveBeenCalledWith("кава");
  });
});

describe("InlineAiRail — error state", () => {
  it("renders the error message with retry and open-in-chat", () => {
    const { onRetry, onOpenInChat } = renderRail({
      status: "error",
      question: "кава",
      message: "Сервер недоступний",
    });
    expect(screen.getByText("Помилка асистента")).toBeInTheDocument();
    expect(screen.getByText("Сервер недоступний")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Повторити/ }));
    expect(onRetry).toHaveBeenCalledWith("кава");
    fireEvent.click(screen.getByRole("button", { name: /Відкрити в чаті/ }));
    expect(onOpenInChat).toHaveBeenCalledWith("кава");
  });
});
