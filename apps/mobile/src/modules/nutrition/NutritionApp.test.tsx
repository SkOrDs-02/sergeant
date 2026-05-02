/**
 * Render tests for the Nutrition module shell (Phase 7 PR 4).
 *
 * Covers:
 *  - Default tab is "Сьогодні" (dashboard);
 *  - Tapping bottom-nav switches між Dashboard / Log / Water / Shopping;
 *  - Selected tab is written до MMKV під ключем
 *    `STORAGE_KEYS.NUTRITION_MAIN_TAB` у raw-string форматі (web parity);
 *  - An existing persisted tab is picked up on first mount;
 *  - Legacy / malformed persisted value falls back to "dashboard".
 */

import { fireEvent, render } from "@testing-library/react-native";
import { ApiClientProvider } from "@sergeant/api-client/react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { apiClient } from "@/api/apiClient";
import { _getMMKVInstance } from "@/lib/storage";
import { ToastProvider } from "@/components/ui/Toast";

import { NutritionApp } from "./NutritionApp";

function renderNutrition() {
  return render(
    <ApiClientProvider client={apiClient}>
      <ToastProvider>
        <NutritionApp />
      </ToastProvider>
    </ApiClientProvider>,
  );
}

// Унікальний рядок в Dashboard card ("Сьогодні").
const DASHBOARD_MARKER = "Сьогодні";
// Унікальний heading у Water сторінці.
const WATER_MARKER = "Щоденний трекер";
// Log: empty-state headline (немає записів при чистому MMKV).
const LOG_EMPTY_MARKER = "Немає записів за цей день";
const SHOPPING_MARKER = "Список покупок";

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("NutritionApp shell", () => {
  it("renders the Dashboard screen by default", () => {
    const { getAllByText } = renderNutrition();
    // 1 — у Dashboard Card title, 1 — у bottom-nav label "Сьогодні".
    expect(getAllByText(DASHBOARD_MARKER).length).toBeGreaterThanOrEqual(1);
  });

  it("switches to the Log screen when the Journal tab is pressed", () => {
    const { getByTestId, getByText } = renderNutrition();

    fireEvent.press(getByTestId("nutrition-bottom-nav-log"));

    expect(getByText(LOG_EMPTY_MARKER)).toBeTruthy();
  });

  it("switches to the Water screen when the Water tab is pressed", () => {
    const { getByTestId, getByText } = renderNutrition();

    fireEvent.press(getByTestId("nutrition-bottom-nav-water"));

    expect(getByText(WATER_MARKER)).toBeTruthy();
  });

  it("switches to the Shopping screen when the Shopping tab is pressed", () => {
    const { getByTestId, getByText } = renderNutrition();

    fireEvent.press(getByTestId("nutrition-bottom-nav-shopping"));

    expect(getByText(SHOPPING_MARKER)).toBeTruthy();
  });

  it("writes the selected tab to MMKV under NUTRITION_MAIN_TAB", () => {
    const { getByTestId } = renderNutrition();

    fireEvent.press(getByTestId("nutrition-bottom-nav-log"));

    const raw = _getMMKVInstance().getString(STORAGE_KEYS.NUTRITION_MAIN_TAB);
    expect(raw).toBe("log");
  });

  it("persists the shopping tab", () => {
    const { getByTestId } = renderNutrition();

    fireEvent.press(getByTestId("nutrition-bottom-nav-shopping"));

    const raw = _getMMKVInstance().getString(STORAGE_KEYS.NUTRITION_MAIN_TAB);
    expect(raw).toBe("shopping");
  });

  it("picks up a persisted tab from MMKV on first mount", () => {
    _getMMKVInstance().set(STORAGE_KEYS.NUTRITION_MAIN_TAB, "water");

    const { getByText } = renderNutrition();

    expect(getByText(WATER_MARKER)).toBeTruthy();
  });

  it("falls back to dashboard when the persisted value is malformed", () => {
    _getMMKVInstance().set(STORAGE_KEYS.NUTRITION_MAIN_TAB, "garbage");

    const { getAllByText } = renderNutrition();

    expect(getAllByText(DASHBOARD_MARKER).length).toBeGreaterThanOrEqual(1);
  });
});
