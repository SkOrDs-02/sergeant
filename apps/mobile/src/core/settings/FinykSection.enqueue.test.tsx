/**
 * Cloud-sync wiring test for `<FinykSection>`.
 *
 * `FINYK_CUSTOM_CATS` is a tracked key in `SYNC_MODULES.finyk` — every
 * mutation must call `enqueueChange(FINYK_CUSTOM_CATS)` so the
 * scheduler marks the finyk module dirty and the new categories
 * round-trip through cloud sync (and survive a backup restore on
 * another device).
 *
 * Mirrors the assets/budgets/transactions parity tests in
 * `modules/finyk/lib/__tests__/`.
 */
import { fireEvent, render } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

const mockEnqueueChange = jest.fn();

jest.mock("@/sync/enqueue", () => ({
  enqueueChange: (...args: unknown[]) => mockEnqueueChange(...args),
}));

import { FinykSection } from "./FinykSection";

const KEY = STORAGE_KEYS.FINYK_CUSTOM_CATS;

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockEnqueueChange.mockClear();
});

describe("FinykSection — enqueueChange wiring", () => {
  it("addCategory fires enqueueChange with the custom-categories key", () => {
    const { getByText, getByTestId } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    fireEvent.changeText(getByTestId("finyk-custom-cat-input"), "🎨 Хобі");
    fireEvent.press(getByTestId("finyk-custom-cat-add"));

    expect(mockEnqueueChange).toHaveBeenCalledWith(KEY);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire enqueueChange when the add button is pressed with empty input", () => {
    const { getByText, getByTestId } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    fireEvent.changeText(getByTestId("finyk-custom-cat-input"), "   ");
    fireEvent.press(getByTestId("finyk-custom-cat-add"));

    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("confirmRemove fires enqueueChange with the custom-categories key", () => {
    _getMMKVInstance().set(
      KEY,
      JSON.stringify([{ id: "c_1", label: "📚 Книги" }]),
    );
    const { getByText, getByTestId } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    fireEvent.press(getByTestId("finyk-custom-cat-remove-c_1"));

    // ConfirmDialog ships explicit `confirm-dialog-confirm` /
    // `confirm-dialog-cancel` testIDs — target the action button
    // directly instead of relying on `parent.parent` traversal of the
    // dialog title.
    expect(getByText("Видалити категорію?")).toBeTruthy();
    fireEvent.press(getByTestId("confirm-dialog-confirm"));

    expect(mockEnqueueChange).toHaveBeenCalledWith(KEY);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
  });
});
