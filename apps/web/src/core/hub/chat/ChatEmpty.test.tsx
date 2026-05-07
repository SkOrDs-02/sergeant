/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatEmpty } from "./ChatEmpty";
import { messages } from "@shared/i18n/uk";

describe("ChatEmpty (PR-26 / §A12)", () => {
  it("рендерить заголовок, опис та 4 suggestion-chip-и", () => {
    render(<ChatEmpty onPickSuggestion={() => {}} />);

    expect(screen.getByText(messages.hub.chatEmptyTitle)).toBeInTheDocument();
    expect(
      screen.getByText(messages.hub.chatEmptyDescription),
    ).toBeInTheDocument();
    expect(screen.getByTestId("chat-empty-suggestion-finyk")).toHaveTextContent(
      messages.hub.chatEmptySuggestionFinyk,
    );
    expect(
      screen.getByTestId("chat-empty-suggestion-fizruk"),
    ).toHaveTextContent(messages.hub.chatEmptySuggestionFizruk);
    expect(
      screen.getByTestId("chat-empty-suggestion-nutrition"),
    ).toHaveTextContent(messages.hub.chatEmptySuggestionNutrition);
    expect(
      screen.getByTestId("chat-empty-suggestion-routine"),
    ).toHaveTextContent(messages.hub.chatEmptySuggestionRoutine);
  });

  it("викликає `onPickSuggestion` з prompt-ом chip-а на тап", () => {
    const onPick = vi.fn();
    render(<ChatEmpty onPickSuggestion={onPick} />);

    fireEvent.click(screen.getByTestId("chat-empty-suggestion-finyk"));
    expect(onPick).toHaveBeenCalledExactlyOnceWith(
      messages.hub.chatEmptySuggestionFinyk,
    );

    fireEvent.click(screen.getByTestId("chat-empty-suggestion-routine"));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenLastCalledWith(
      messages.hub.chatEmptySuggestionRoutine,
    );
  });

  it("має aria-label для дискаверабіліті у скрін-рідерах", () => {
    render(<ChatEmpty onPickSuggestion={() => {}} />);

    expect(
      screen.getByRole("region", {
        name: messages.hub.chatEmptyAriaLabel,
      }),
    ).toBeInTheDocument();
  });
});
