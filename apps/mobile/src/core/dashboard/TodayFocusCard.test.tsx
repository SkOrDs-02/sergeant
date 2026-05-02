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
  it("renders nothing when focus is null (bento module rows handle quick-add)", () => {
    const { toJSON, queryByTestId } = render(
      <TodayFocusCard focus={null} onAction={jest.fn()} />,
    );

    expect(toJSON()).toBeNull();
    expect(queryByTestId("today-focus-empty")).toBeNull();
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
