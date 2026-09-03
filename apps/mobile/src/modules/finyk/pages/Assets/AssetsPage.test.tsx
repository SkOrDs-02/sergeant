/**
 * Jest render + behaviour tests for `AssetsPage` (Phase 4 / Assets).
 *
 * Covers:
 *  - Empty state renders per section.
 *  - Seeded 2 accounts + 1 manual asset + 1 debt + 1 receivable
 *    produces the expected networth headline.
 *  - "+ Add" buttons open the correct sheet (asset / debt / receivable).
 *  - Tapping an existing row opens the sheet pre-populated for edit.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";

import { AssetsPage } from "./AssetsPage";
import type { FinykAssetsSeed } from "@/modules/finyk/lib/assetsStore";

beforeEach(() => {
  _getMMKVInstance().clearAll();
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

const SEED: FinykAssetsSeed = {
  accounts: [
    { id: "acc-1", balance: 500_00, currencyCode: 980, type: "white" },
    {
      id: "acc-2",
      balance: 300_00,
      creditLimit: 1000_00,
      currencyCode: 980,
      type: "black",
    },
  ],
  manualAssets: [
    { id: "ma-1", name: "Готівка", emoji: "💵", amount: 200, currency: "UAH" },
  ],
  manualDebts: [
    {
      id: "d-1",
      name: "Батя",
      emoji: "👨",
      amount: 100,
      totalAmount: 100,
      linkedTxIds: [],
    },
  ],
  receivables: [
    { id: "r-1", name: "Оля", emoji: "👧", amount: 50, linkedTxIds: [] },
  ],
  transactions: [],
};

describe("AssetsPage", () => {
  it("renders empty states for every section when no data is seeded", () => {
    render(<AssetsPage testID="assets" />);

    expect(screen.getByText("Активи")).toBeTruthy();
    expect(screen.getByTestId("assets-accounts-empty")).toBeTruthy();
    expect(screen.getByTestId("assets-debts-empty")).toBeTruthy();
    expect(screen.getByTestId("assets-receivables-empty")).toBeTruthy();
  });

  it("renders seeded rows + computes networth from the summary", () => {
    render(<AssetsPage testID="assets" seed={SEED} />);

    // Rows render with their labels.
    expect(screen.getByText("Біла картка")).toBeTruthy();
    expect(screen.getByText("Кредитна картка")).toBeTruthy();
    expect(screen.getByText("Готівка")).toBeTruthy();
    expect(screen.getByText("Батя")).toBeTruthy();
    expect(screen.getByText("Оля")).toBeTruthy();

    // networth = (500 + 200 + 50) − (700 + 100) = 750 − 800 = −50
    expect(
      screen.getByTestId("assets-networth-value").props.children.join(""),
    ).toContain("-50");
  });

  it("'+ Додати актив' opens the asset sheet in new-asset mode", () => {
    render(<AssetsPage testID="assets" />);

    expect(screen.queryByText("Новий актив")).toBeNull();

    act(() => {
      fireEvent.press(screen.getByTestId("assets-accounts-add"));
    });

    expect(screen.getByText("Новий актив")).toBeTruthy();
  });

  it("'+ Додати борг' opens the debt sheet in new-debt mode", () => {
    render(<AssetsPage testID="assets" />);

    act(() => {
      fireEvent.press(screen.getByTestId("assets-debts-add"));
    });

    expect(screen.getByText("Новий борг")).toBeTruthy();
  });

  it("'+ Додати дебіторку' opens the receivable sheet in new-receivable mode", () => {
    render(<AssetsPage testID="assets" />);

    act(() => {
      fireEvent.press(screen.getByTestId("assets-receivables-add"));
    });

    expect(screen.getByText("Нова дебіторка")).toBeTruthy();
  });

  it("tapping an existing manual asset row opens the sheet prefilled", () => {
    render(<AssetsPage testID="assets" seed={SEED} />);

    act(() => {
      fireEvent.press(screen.getByTestId("assets-asset-ma-1"));
    });

    expect(screen.getByText("Редагувати актив")).toBeTruthy();
    // Prefilled name input is visible.
    expect(screen.getByDisplayValue("Готівка")).toBeTruthy();
  });

  it("tapping an existing debt row opens the sheet prefilled", () => {
    render(<AssetsPage testID="assets" seed={SEED} />);

    act(() => {
      fireEvent.press(screen.getByTestId("assets-debt-d-1"));
    });

    expect(screen.getByText("Редагувати борг")).toBeTruthy();
    expect(screen.getByDisplayValue("Батя")).toBeTruthy();
  });

  // F-MULTICUR — non-UAH manual assets stay out of networth and must
  // surface a count banner so the exclusion isn't silent (mobile parity
  // with the web Overview banner).
  it("shows the non-UAH banner and excludes a USD manual asset from networth", () => {
    const seed: FinykAssetsSeed = {
      ...SEED,
      manualAssets: [
        ...(SEED.manualAssets ?? []),
        {
          id: "ma-2",
          name: "Ощадний",
          emoji: "💵",
          amount: 1000,
          currency: "USD",
        },
      ],
    };
    render(<AssetsPage testID="assets" seed={seed} />);

    expect(screen.getByTestId("assets-non-uah-banner")).toBeTruthy();
    expect(
      screen.getByText(/1 актив в іноземній валюті не враховую в нетворсі/),
    ).toBeTruthy();

    // networth unchanged by the USD asset — same math as the base seed:
    // (500 + 200 + 50) − (700 + 100) = −50.
    expect(
      screen.getByTestId("assets-networth-value").props.children.join(""),
    ).toContain("-50");
  });

  it("does not show the non-UAH banner when every manual asset is UAH", () => {
    render(<AssetsPage testID="assets" seed={SEED} />);

    expect(screen.queryByTestId("assets-non-uah-banner")).toBeNull();
  });
});
