import { fireEvent, render } from "@testing-library/react-native";

import { InlineAiRail } from "../InlineAiRail";

const baseHandlers = () => ({
  onRetry: jest.fn(),
  onCancel: jest.fn(),
  onOpenInChat: jest.fn(),
  onDismiss: jest.fn(),
});

describe("InlineAiRail", () => {
  it("renders nothing while idle", () => {
    const handlers = baseHandlers();
    const { queryByTestId } = render(
      <InlineAiRail
        state={{ status: "idle", question: "" } as never}
        {...handlers}
      />,
    );

    expect(queryByTestId("hub-search-inline-ai")).toBeNull();
  });

  it("renders a successful answer and opens the prompt in chat", () => {
    const handlers = baseHandlers();
    const { getByLabelText, getByText, getByTestId } = render(
      <InlineAiRail
        state={
          {
            status: "success",
            question: "monthly budget",
            answer: "You spent less this week.",
            hasToolCalls: true,
            truncated: false,
          } as never
        }
        {...handlers}
      />,
    );

    expect(getByTestId("hub-search-inline-ai-answer")).toBeTruthy();
    expect(getByText("You spent less this week.")).toBeTruthy();

    fireEvent.press(getByLabelText("Відкрити в чаті"));

    expect(handlers.onOpenInChat).toHaveBeenCalledWith("monthly budget");
  });

  it("wires loading cancel and error retry actions", () => {
    const loadingHandlers = baseHandlers();
    const loading = render(
      <InlineAiRail
        state={{ status: "loading", question: "routine" } as never}
        {...loadingHandlers}
      />,
    );
    fireEvent.press(loading.getByText(/Скасувати|Cancel/i));
    expect(loadingHandlers.onCancel).toHaveBeenCalledTimes(1);
    loading.unmount();

    const errorHandlers = baseHandlers();
    const error = render(
      <InlineAiRail
        state={
          {
            status: "error",
            question: "routine",
            message: "Network failed",
          } as never
        }
        {...errorHandlers}
      />,
    );
    fireEvent.press(error.getByText(/Повторити|Retry/i));
    expect(errorHandlers.onRetry).toHaveBeenCalledWith("routine");
  });
});
