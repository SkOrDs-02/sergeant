/**
 * Render tests for `<FizrukSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Фізрук" title;
 *  - expanding reveals the rest-timer sub-group with one row per
 *    `REST_CATEGORY_LABELS` entry from `@sergeant/fizruk-domain`;
 *  - tapping a preset pill persists the matching category/seconds
 *    pair into the shared `fizruk_rest_settings_v1` MMKV slice (same
 *    key web's `useRestSettings` writes to);
 *  - the backup/data sub-group surfaces its deferred-port placeholder
 *    (Phase 6).
 */

import { fireEvent, render } from "@testing-library/react-native";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import { FizrukSection } from "./FizrukSection";

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("FizrukSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<FizrukSection />);
    expect(getByText("Фізрук")).toBeTruthy();
    expect(queryByText("Таймер відпочинку")).toBeNull();
  });

  it("expands to reveal rest-timer rows and the deferred backup notice", () => {
    const { getByText } = render(<FizrukSection />);

    fireEvent.press(getByText("Фізрук"));

    expect(getByText("Таймер відпочинку")).toBeTruthy();
    expect(getByText("Базові")).toBeTruthy();
    expect(getByText("Ізоляція")).toBeTruthy();
    expect(getByText("Кардіо")).toBeTruthy();

    expect(getByText("Резервні копії та дані")).toBeTruthy();
    expect(
      getByText(
        /Експорт та імпорт тренувань чекають реального mobile-адаптера downloadJson/,
      ),
    ).toBeTruthy();
  });

  it("persists a selected rest preset into fizruk_rest_settings_v1", () => {
    const { getByText, getByTestId } = render(<FizrukSection />);
    fireEvent.press(getByText("Фізрук"));

    fireEvent.press(getByTestId("fizruk-rest-compound-120"));

    const stored = _getMMKVInstance().getString(
      STORAGE_KEYS.FIZRUK_REST_SETTINGS,
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({ compound: 120 });
  });
});
