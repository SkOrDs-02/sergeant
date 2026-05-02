/**
 * Render tests for `<GeneralSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Загальні" title;
 *  - expanding reveals the theme picker + "Показувати AI-коуч",
 *    the dashboard reorder list with the
 *    visible-module labels, and the deferred Cloud-sync sub-group
 *    placeholder plus the live Backup sub-group;
 *  - toggling "Темна тема" persists `darkMode` into the shared
 *    `hub_prefs_v1` MMKV slice;
 *  - toggling "Показувати AI-коуч" persists `showCoach` with the
 *    web-compatible default-on semantics (`prefs.showCoach !== false`);
 *  - the ▲ / ▼ buttons on the dashboard reorder list rewrite
 *    `STORAGE_KEYS.DASHBOARD_ORDER` via `useDashboardOrder`;
 *  - export / import backup buttons are rendered and wired.
 */

import { fireEvent, render } from "@testing-library/react-native";
import { downloadJson, STORAGE_KEYS } from "@sergeant/shared";

import { buildHubBackupPayload } from "@/core/hub/hubBackup";
import { _getMMKVInstance } from "@/lib/storage";

import { GeneralSection } from "./GeneralSection";

// Mock the Toast context so `useToast()` works in tests.
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

// Mock the hub backup helpers.
jest.mock("@/core/hub/hubBackup", () => ({
  buildHubBackupPayload: jest.fn(() => ({
    kind: "hub-backup",
    schemaVersion: 1,
    exportedAt: "2026-01-01",
    finyk: {},
    fizruk: {},
    routine: {},
    nutrition: {},
  })),
  applyHubBackupPayload: jest.fn(),
}));

// Mock shared download/import so we can verify they are called.
jest.mock("@sergeant/shared", () => {
  const actual = jest.requireActual("@sergeant/shared");
  return {
    ...actual,
    downloadJson: jest.fn().mockResolvedValue(undefined),
    pickJson: jest.fn().mockResolvedValue(null),
  };
});

beforeEach(() => {
  _getMMKVInstance().clearAll();
  jest.clearAllMocks();
});

describe("GeneralSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<GeneralSection />);
    expect(getByText("Загальні")).toBeTruthy();
    // Controls are hidden until the group is expanded.
    expect(queryByText("Тема оформлення")).toBeNull();
    expect(queryByText("Показувати AI-коуч")).toBeNull();
  });

  it("expands to reveal active toggles, dashboard reorder list, and deferred sub-group notices", () => {
    const { getByText, getAllByText, getByTestId } = render(<GeneralSection />);

    fireEvent.press(getByText("Загальні"));

    expect(getByText("Тема оформлення")).toBeTruthy();
    expect(getByText("Показувати AI-коуч")).toBeTruthy();

    expect(getByText("Дашборд")).toBeTruthy();
    expect(getByText("Активні модулі")).toBeTruthy();
    expect(getByText("Упорядкувати модулі")).toBeTruthy();
    expect(getByText("Хмарна синхронізація")).toBeTruthy();
    expect(getByText("Резервна копія Hub")).toBeTruthy();

    // Module labels render in both "Active modules" and the reorder list.
    expect(getAllByText("Фінік").length).toBeGreaterThanOrEqual(2);
    expect(getAllByText("Фізрук").length).toBeGreaterThanOrEqual(2);
    expect(getAllByText("Рутина").length).toBeGreaterThanOrEqual(2);
    expect(getAllByText("Харчування").length).toBeGreaterThanOrEqual(2);
    expect(getByTestId("dashboard-reorder-down-finyk")).toBeTruthy();
    expect(getByTestId("dashboard-reorder-up-nutrition")).toBeTruthy();
    expect(getByTestId("general-active-module-finyk")).toBeTruthy();
    expect(getByTestId("general-hide-inactive-toggle")).toBeTruthy();
  });

  it("rewrites the dashboard order when the reorder ▼ button is pressed", () => {
    const { getByText, getByTestId } = render(<GeneralSection />);
    fireEvent.press(getByText("Загальні"));

    // Move Фінік one slot down — Fizruk moves to the top.
    fireEvent.press(getByTestId("dashboard-reorder-down-finyk"));

    const stored = _getMMKVInstance().getString(STORAGE_KEYS.DASHBOARD_ORDER);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toEqual([
      "fizruk",
      "finyk",
      "routine",
      "nutrition",
    ]);
  });

  it("persists the dark-mode pref into the shared hub_prefs_v1 slice", () => {
    const { getByText, getByTestId } = render(<GeneralSection />);
    fireEvent.press(getByText("Загальні"));

    fireEvent.press(getByTestId("theme-toggle-dark"));

    const stored = _getMMKVInstance().getString(STORAGE_KEYS.HUB_PREFS);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({ darkMode: true });
  });

  it("persists the show-coach pref with web-compatible default-on semantics", () => {
    const { getByText, getByTestId } = render(<GeneralSection />);
    fireEvent.press(getByText("Загальні"));

    // Default: the toggle is on (mirrors web `showCoach !== false`).
    // Turning it off should persist `showCoach: false` explicitly.
    fireEvent(getByTestId("general-show-coach-toggle"), "valueChange", false);

    const stored = _getMMKVInstance().getString(STORAGE_KEYS.HUB_PREFS);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({ showCoach: false });
  });

  it("renders export and import backup buttons", () => {
    const { getByText, getByTestId } = render(<GeneralSection />);
    fireEvent.press(getByText("Загальні"));

    expect(getByTestId("general-export-backup")).toBeTruthy();
    expect(getByTestId("general-import-backup")).toBeTruthy();
  });

  it("calls downloadJson with a hub backup payload on export", async () => {
    const { getByText, getByTestId } = render(<GeneralSection />);
    fireEvent.press(getByText("Загальні"));

    fireEvent.press(getByTestId("general-export-backup"));

    // Wait for the async handler to resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(buildHubBackupPayload).toHaveBeenCalled();
    expect(downloadJson).toHaveBeenCalledWith(
      expect.stringMatching(/^hub-backup-\d{4}-\d{2}-\d{2}\.json$/),
      expect.objectContaining({ kind: "hub-backup" }),
    );
  });
});
