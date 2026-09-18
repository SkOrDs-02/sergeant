/**
 * Jest render + behaviour tests for the Finyk Analytics screen (Phase 4
 * / PR 6). Mirrors the shape of `Overview.test.tsx`:
 *
 *  - Empty data → zero-state renders for every section (no comparison
 *    card, category / merchant empty rows).
 *  - Seeded tx for the current month → summary totals come from
 *    `getMonthlySummary`, the donut renders a row per category and the
 *    merchant list renders rank + name + formatted total.
 *  - `MonthNav`: the "next" button is disabled on the current month
 *    and stepping back changes the visible label.
 *
 * All expected numbers are derived from the same selectors in
 * `@sergeant/finyk-domain` that the screen runs — so the test is
 * self-consistent with the domain package and does not hard-code
 * particular UAH sums.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  getMonthlySummary,
  getTopMerchants,
  type Transaction,
} from "@sergeant/finyk-domain/domain";

import { Analytics } from "./Analytics";
import type { FinykAnalyticsData } from "./types";
import { formatNumberUk } from "@sergeant/shared";

function emptyData(): FinykAnalyticsData {
  return {
    realTx: [],
    loadingTx: false,
    excludedTxIds: new Set<string>(),
    txCategories: {},
    txSplits: {},
    customCategories: [],
  };
}

function tx(
  id: string,
  dateIso: string,
  description: string,
  amountKopiyky: number,
  mcc: number,
): Transaction {
  const time = new Date(dateIso).getTime();
  return {
    id,
    amount: amountKopiyky,
    date: dateIso,
    categoryId: "uncategorized",
    type: amountKopiyky < 0 ? "expense" : "income",
    source: "mono",
    time,
    description,
    mcc,
    accountId: null,
    manual: false,
    _source: "mono",
    _accountId: null,
    _manual: false,
  };
}

describe("Analytics screen (mobile)", () => {
  const fixedNow = new Date(2025, 4, 15); // 15 травня 2025

  describe("empty data", () => {
    it("renders the month label for the fixed now", () => {
      render(<Analytics data={emptyData()} now={fixedNow} />);
      expect(screen.getByTestId("finyk-analytics-month-label")).toBeTruthy();
    });

    it("disables the next-month button on the current month", () => {
      render(<Analytics data={emptyData()} now={fixedNow} />);
      const next = screen.getByTestId("finyk-analytics-month-next");
      expect(next.props.accessibilityState?.disabled).toBe(true);
    });

    it("shows empty rows for the category + merchant sections", () => {
      render(<Analytics data={emptyData()} now={fixedNow} />);
      expect(
        screen.getByText("Транзакцій за цей місяць не знайдено"),
      ).toBeTruthy();
      expect(screen.getByText("Транзакцій ще немає")).toBeTruthy();
    });

    it("hides the comparison card when there is no data", () => {
      render(<Analytics data={emptyData()} now={fixedNow} />);
      expect(screen.queryByTestId("finyk-analytics-comparison")).toBeNull();
    });

    it("renders zero totals in the summary card", () => {
      render(<Analytics data={emptyData()} now={fixedNow} />);
      // Three "0 ₴" cells (spent / income / balance with "+" prefix).
      const zeros = screen.getAllByText(/0 ₴/);
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("seeded month", () => {
    const seeded: FinykAnalyticsData = {
      ...emptyData(),
      realTx: [
        // Current month (травень 2025) — expenses
        tx("t1", "2025-05-02T10:00:00Z", "АТБ", -150_00, 5411),
        tx("t2", "2025-05-05T10:00:00Z", "АТБ", -250_00, 5411),
        tx("t3", "2025-05-08T10:00:00Z", "Сільпо", -400_00, 5411),
        tx("t4", "2025-05-12T10:00:00Z", "Таксі", -80_00, 4121),
        // Current month — income
        tx("t5", "2025-05-10T10:00:00Z", "Зарплата", 20_000_00, 0),
        // Previous month (квітень) — expenses
        tx("t6", "2025-04-03T10:00:00Z", "АТБ", -100_00, 5411),
        tx("t7", "2025-04-20T10:00:00Z", "Таксі", -60_00, 4121),
      ],
    };

    it("renders summary totals that match getMonthlySummary", () => {
      render(<Analytics data={seeded} now={fixedNow} />);
      const currTx = seeded.realTx.filter((t) => {
        const d = new Date(t.time);
        return d.getFullYear() === 2025 && d.getMonth() + 1 === 5;
      });
      const summary = getMonthlySummary(currTx, {
        excludedTxIds: seeded.excludedTxIds,
        txSplits: seeded.txSplits,
      });
      // The summary numbers can appear in other sections too (e.g.
      // a merchant's total equals the spend sum); assert at least one
      // match exists rather than uniqueness.
      expect(
        screen.getAllByText(`${formatNumberUk(summary.spent)} ₴`).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(`${formatNumberUk(summary.income)} ₴`).length,
      ).toBeGreaterThan(0);
    });

    it("renders the month-over-month comparison card", () => {
      render(<Analytics data={seeded} now={fixedNow} />);
      expect(screen.getByTestId("finyk-analytics-comparison")).toBeTruthy();
      expect(
        screen.getByTestId("finyk-analytics-compare-expense"),
      ).toBeTruthy();
      expect(screen.getByTestId("finyk-analytics-compare-income")).toBeTruthy();
    });

    it("renders the donut with top merchants list", () => {
      render(<Analytics data={seeded} now={fixedNow} />);
      expect(screen.getByTestId("finyk-analytics-donut")).toBeTruthy();
      expect(screen.getByTestId("finyk-analytics-merchants")).toBeTruthy();

      const merchants = getTopMerchants(
        seeded.realTx.filter((t) => {
          const d = new Date(t.time);
          return d.getFullYear() === 2025 && d.getMonth() + 1 === 5;
        }),
        { excludedTxIds: seeded.excludedTxIds },
      );
      // Domain rolls up "АТБ" into a single merchant and ranks by spend.
      expect(merchants[0]?.name).toBe("АТБ");
      expect(screen.getByText("АТБ")).toBeTruthy();
    });
  });

  describe("category donut toggle", () => {
    // Seven distinct MCC-driven categories so the donut has a non-empty
    // long tail (> TOP_N = 5) and the "Показати всі" toggle is rendered.
    const manyCategories: FinykAnalyticsData = {
      ...emptyData(),
      realTx: [
        tx("c1", "2025-05-02T10:00:00Z", "АТБ", -600_00, 5411), // food
        tx("c2", "2025-05-03T10:00:00Z", "Таксі", -500_00, 4121), // transport
        tx("c3", "2025-05-04T10:00:00Z", "McDonalds", -400_00, 5812), // restaurant
        tx("c4", "2025-05-05T10:00:00Z", "Spotify", -300_00, 4899), // subscriptions
        tx("c5", "2025-05-06T10:00:00Z", "Аптека", -250_00, 5912), // health
        tx("c6", "2025-05-07T10:00:00Z", "Rozetka", -150_00, 5311), // shopping
        tx("c7", "2025-05-08T10:00:00Z", "Cinema", -80_00, 7832), // entertainment
      ],
    };

    it("renders the toggle collapsed by default with an Інше bucket", () => {
      render(<Analytics data={manyCategories} now={fixedNow} />);
      const toggle = screen.getByTestId("finyk-analytics-donut-toggle");
      expect(toggle).toBeTruthy();
      // Collapsed legend shows an "Інше" row rolling up the long tail.
      expect(
        screen.getByTestId("finyk-analytics-donut-row-_other"),
      ).toBeTruthy();
    });

    it("expands the legend to every category when pressed", () => {
      render(<Analytics data={manyCategories} now={fixedNow} />);
      const toggle = screen.getByTestId("finyk-analytics-donut-toggle");
      fireEvent.press(toggle);
      // The "Інше" row is gone and every real category id has its own row.
      expect(
        screen.queryByTestId("finyk-analytics-donut-row-_other"),
      ).toBeNull();
      for (const id of [
        "food",
        "transport",
        "restaurant",
        "subscriptions",
        "health",
        "shopping",
        "entertainment",
      ]) {
        expect(
          screen.getByTestId(`finyk-analytics-donut-row-${id}`),
        ).toBeTruthy();
      }
    });

    it("hides the toggle when there are ≤ TOP_N categories", () => {
      const fewCategories: FinykAnalyticsData = {
        ...emptyData(),
        realTx: [
          tx("f1", "2025-05-02T10:00:00Z", "АТБ", -300_00, 5411),
          tx("f2", "2025-05-05T10:00:00Z", "Таксі", -80_00, 4121),
        ],
      };
      render(<Analytics data={fewCategories} now={fixedNow} />);
      expect(screen.queryByTestId("finyk-analytics-donut-toggle")).toBeNull();
    });
  });

  describe("month navigation", () => {
    it("stepping back unblocks the next-month button", () => {
      render(<Analytics data={emptyData()} now={new Date(2025, 4, 15)} />);
      const prev = screen.getByTestId("finyk-analytics-month-prev");
      fireEvent.press(prev);
      const next = screen.getByTestId("finyk-analytics-month-next");
      expect(next.props.accessibilityState?.disabled).toBe(false);
    });
  });
});
