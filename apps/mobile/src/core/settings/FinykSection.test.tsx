/**
 * Render tests for `<FinykSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Фінік" title;
 *  - expanding reveals the custom-categories sub-group (input +
 *    "Додати" button + empty-state copy) plus the deferred
 *    Monobank / Accounts notices;
 *  - adding a category fires `triggerFinykDualWrite` with a non-empty
 *    `customCategories` blob slice (dual-write teardown — no MMKV write);
 *  - removing a category is gated by a ConfirmDialog and drops the
 *    entry on confirm, firing a second dual-write with an empty slice.
 *
 * SQLite cache seeding: `useFinykCustomCategories` reads from
 * `getCachedFinykSqliteState().customCategories`. We seed the cache
 * directly so the component renders with existing categories without
 * needing the async boot path.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";
import { clearFinykSqliteCache } from "@/modules/finyk/lib/sqliteReader";
import { __resetFinykSqliteReadGateForTests } from "@/modules/finyk/lib/sqliteReadGate";

// Mock the dual-write trigger so we can assert without the full SQLite stack.
const mockTriggerFinykDualWrite = jest.fn();
jest.mock("@/modules/finyk/lib/dualWrite", () => ({
  __esModule: true,
  triggerFinykDualWrite: (...args: unknown[]) =>
    mockTriggerFinykDualWrite(...args),
  isFinykDualWriteRegistered: () => false,
}));

import { FinykSection } from "./FinykSection";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  mockTriggerFinykDualWrite.mockReset();
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

  it("fires dual-write with the new category blob on add (no MMKV write)", () => {
    const { getByText, getByTestId } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    const input = getByTestId("finyk-custom-cat-input");
    fireEvent.changeText(input, "🎨 Хобі");
    fireEvent.press(getByTestId("finyk-custom-cat-add"));

    // Dual-write should have been called with prev=[] and next=[{id, label}].
    expect(mockTriggerFinykDualWrite).toHaveBeenCalledTimes(1);
    const [prevState, nextState] = mockTriggerFinykDualWrite.mock.calls[0] as [
      { customCategories: Array<{ id: string; dataJson: string }> },
      { customCategories: Array<{ id: string; dataJson: string }> },
    ];
    expect(prevState.customCategories).toHaveLength(0);
    expect(nextState.customCategories).toHaveLength(1);
    const parsed = JSON.parse(nextState.customCategories[0]!.dataJson) as {
      id: string;
      label: string;
    };
    expect(parsed.label).toBe("🎨 Хобі");
    expect(typeof parsed.id).toBe("string");
    expect(parsed.id.length).toBeGreaterThan(0);

    // Dual-write teardown: no legacy MMKV write for custom categories.
    expect(_getMMKVInstance().getString("finyk_custom_cats_v1")).toBeFalsy();
  });

  it("removes a category after confirming in the ConfirmDialog (fires dual-write with empty slice)", () => {
    // Seed the SQLite cache directly so the component starts with one category.
    // `__setFinykSqliteCacheForTests` is not exported, so we manipulate
    // via the mutable cache object returned by `getCachedFinykSqliteState`.
    const { getCachedFinykSqliteState } = jest.requireActual<
      typeof import("@/modules/finyk/lib/sqliteReader")
    >("@/modules/finyk/lib/sqliteReader");
    const cache = getCachedFinykSqliteState() as {
      customCategories: Array<{ id: string; label: string }>;
      refreshedAt: string | null;
    };
    cache.customCategories = [{ id: "c_1", label: "📚 Книги" }];
    cache.refreshedAt = new Date().toISOString();

    const { getByText, getByTestId, queryByText } = render(<FinykSection />);
    fireEvent.press(getByText("Фінік"));

    expect(getByText("📚 Книги")).toBeTruthy();

    fireEvent.press(getByTestId("finyk-custom-cat-remove-c_1"));

    expect(getByText("Видалити категорію?")).toBeTruthy();
    fireEvent.press(getByTestId("confirm-dialog-confirm"));

    expect(queryByText("📚 Книги")).toBeNull();

    // After removal the dual-write is called with next.customCategories empty.
    expect(mockTriggerFinykDualWrite).toHaveBeenCalled();
    const lastCall =
      mockTriggerFinykDualWrite.mock.calls[
        mockTriggerFinykDualWrite.mock.calls.length - 1
      ];
    const nextState = lastCall![1] as {
      customCategories: Array<{ id: string; dataJson: string }>;
    };
    expect(nextState.customCategories).toHaveLength(0);
  });
});
