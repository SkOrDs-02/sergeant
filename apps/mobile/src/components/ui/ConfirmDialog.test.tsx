import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo, Pressable } from "react-native";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: () => {} }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing when open=false", () => {
    const { queryByText } = render(
      <ConfirmDialog open={false} title="Видалити запис?" />,
    );
    expect(queryByText("Видалити запис?")).toBeNull();
  });

  it("renders title and description when open=true", () => {
    const { getByText } = render(
      <ConfirmDialog
        open
        title="Видалити запис?"
        description="Цю дію не можна скасувати."
      />,
    );
    expect(getByText("Видалити запис?")).toBeTruthy();
    expect(getByText("Цю дію не можна скасувати.")).toBeTruthy();
  });

  it("pressing the confirm button calls onConfirm", () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <ConfirmDialog open confirmLabel="Так, видалити" onConfirm={onConfirm} />,
    );
    fireEvent.press(getByText("Так, видалити"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pressing the cancel button calls onCancel", () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <ConfirmDialog open cancelLabel="Скасувати дію" onCancel={onCancel} />,
    );
    fireEvent.press(getByText("Скасувати дію"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("scrim press calls onCancel", () => {
    const onCancel = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <ConfirmDialog open onCancel={onCancel} />,
    );
    // The first `Pressable` in render order is the scrim — it has the
    // explicit `confirm-dialog-scrim` testID.
    const scrim = UNSAFE_getAllByType(Pressable)[0];
    expect(scrim.props.testID).toBe("confirm-dialog-scrim");
    fireEvent.press(scrim);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("danger=false uses the non-destructive primary confirm variant", () => {
    const { getByTestId } = render(
      <ConfirmDialog open danger={false} confirmLabel="Зберегти" />,
    );
    // Target the confirm button via its explicit `confirm-dialog-confirm`
    // testID instead of relying on `Pressable` ordering — JSX renders
    // the cancel button before the confirm one in `ConfirmDialog.tsx`,
    // so positional indexing was off-by-one and brittle to JSX edits.
    const confirm = getByTestId("confirm-dialog-confirm");
    expect(confirm.props.className).toContain("bg-brand-strong");
    expect(confirm.props.className).not.toContain("bg-danger");
  });
});
