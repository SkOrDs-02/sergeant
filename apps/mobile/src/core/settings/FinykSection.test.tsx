/**
 * Render tests for `<FinykSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Фінік" title;
 *  - expanding reveals the custom-categories sub-group (input +
 *    "Додати" button + empty-state copy) plus the deferred
 *    Monobank / Accounts notices;
 *  - adding a category persists `{id, label}` into
 *    `STORAGE_KEYS.FINYK_CUSTOM_CATS` — the same
 *    `finyk_custom_cats_v1` key web writes to, so the payload
 *    travels under the existing CloudSync envelope;
 *  - removing a category is gated by a ConfirmDialog and drops the
 *    entry on confirm.
 */

import { fireEvent, render } from "@testing-library/react-native";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import { FinykSection } from "./FinykSection";

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("FinykSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<FinykSection />);
    expect(getByText("Фінік")).toBeTruthy();
    expect(queryByText("Власні категорії витрат")).toBeNull();
  });

  it("expands to reveal the custom-categories sub-group and deferred notices", () => {
    const { getByText } = render(<FinykSection />);

    fireEvent.press(getByText("Фінік"));

    expect(getByText("Власні категорії витрат")).toBeTruthy();
    expect(getByText("Поки немає власних категорій.")).toBeTruthy();
    expect(getByText("Monobank")).toBeTruthy();
    expect(
      getByText(
        /Підключення Monobank, статус підʼєднання та очистка кешу транзакцій/,
      ),
    ).toBeTruthy();
    expect(getByText("Рахунки")).toBeTruthy();
    expect(
      getByText(
        /Приховування рахунків з балансу та нетворсу тягне `finyk_info_cache`/,
      ),
    ).toBeTruthy();
  });

  it("persists a newly added custom category into finyk_custom_cats_v1", () => {
    const { getByText, getByTestId } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    const input = getByTestId("finyk-custom-cat-input");
    fireEvent.changeText(input, "🎨 Хобі");
    fireEvent.press(getByTestId("finyk-custom-cat-add"));

    const raw = _getMMKVInstance().getString(STORAGE_KEYS.FINYK_CUSTOM_CATS);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as Array<{
      id: string;
      label: string;
    }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("🎨 Хобі");
    expect(typeof parsed[0].id).toBe("string");
    expect(parsed[0].id.length).toBeGreaterThan(0);
  });

  it("removes a category after confirming in the ConfirmDialog", () => {
    _getMMKVInstance().set(
      STORAGE_KEYS.FINYK_CUSTOM_CATS,
      JSON.stringify([{ id: "c_1", label: "📚 Книги" }]),
    );
    const { getByText, getByTestId, queryByText } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    expect(getByText("📚 Книги")).toBeTruthy();

    fireEvent.press(getByTestId("finyk-custom-cat-remove-c_1"));

    // ConfirmDialog is open — confirm label is "Видалити". The
    // dialog ships explicit testIDs (`confirm-dialog-confirm` /
    // `-cancel`) so we can target the action button directly without
    // relying on parent-pointer traversal (which broke once the
    // Modal's render tree was restructured).
    expect(getByText("Видалити категорію?")).toBeTruthy();
    fireEvent.press(getByTestId("confirm-dialog-confirm"));

    expect(queryByText("📚 Книги")).toBeNull();

    const raw = _getMMKVInstance().getString(STORAGE_KEYS.FINYK_CUSTOM_CATS);
    expect(JSON.parse(raw as string)).toEqual([]);
  });
});
