import { fireEvent, render } from "@testing-library/react-native";

import type { Rec } from "@sergeant/shared";

import { TodayFocusCard } from "./TodayFocusCard";

function rec(partial: Partial<Rec> = {}): Rec {
  return {
    id: "r1",
    module: "finyk",
    priority: 50,
    icon: "💡",
    title: "Додай витрату",
    body: "Один тап — готово.",
    action: "open-finyk",
    ...partial,
  };
}

describe("TodayFocusCard", () => {
  it("renders empty state with all 4 quick-add chips when focus is null", () => {
    const { getByTestId } = render(
      <TodayFocusCard focus={null} onAction={jest.fn()} />,
    );

    expect(getByTestId("today-focus-empty")).toBeTruthy();
    expect(getByTestId("today-focus-chip-finyk")).toBeTruthy();
    expect(getByTestId("today-focus-chip-routine")).toBeTruthy();
    expect(getByTestId("today-focus-chip-fizruk")).toBeTruthy();
    // Nutrition was promoted out of the Phase-7 gate by
    // 2f17f9b5 ("feat(mobile): show nutrition on hub dashboard"); it
    // now ships alongside finyk / routine / fizruk.
    expect(getByTestId("today-focus-chip-nutrition")).toBeTruthy();
  });

  it("fires onQuickAdd with the correct module when a chip is tapped", () => {
    const onQuickAdd = jest.fn();
    const { getByTestId } = render(
      <TodayFocusCard
        focus={null}
        onAction={jest.fn()}
        onQuickAdd={onQuickAdd}
      />,
    );

    fireEvent.press(getByTestId("today-focus-chip-routine"));
    expect(onQuickAdd).toHaveBeenCalledWith("routine");
  });

  it("renders focus title + body and invokes onAction on primary press", () => {
    const onAction = jest.fn();
    const focus = rec();
    const { getByTestId, getByText } = render(
      <TodayFocusCard focus={focus} onAction={onAction} />,
    );

    expect(getByText(/Додай витрату/)).toBeTruthy();
    expect(getByText("Один тап — готово.")).toBeTruthy();

    fireEvent.press(getByTestId("today-focus-primary"));
    expect(onAction).toHaveBeenCalledWith("open-finyk", focus);
  });

  it("invokes onDismiss when «Пізніше» is tapped", () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <TodayFocusCard
        focus={rec()}
        onAction={jest.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.press(getByTestId("today-focus-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("r1");
  });

  it("hides the dismiss button when no onDismiss is provided", () => {
    const { queryByTestId } = render(
      <TodayFocusCard focus={rec()} onAction={jest.fn()} />,
    );
    expect(queryByTestId("today-focus-dismiss")).toBeNull();
  });
});
