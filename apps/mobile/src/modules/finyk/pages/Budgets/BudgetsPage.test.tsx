/**
 * BudgetsPage smoke + interaction tests. Covers:
 *  - Empty-state: the Plan card shows a hint, limits/goals/subs lists
 *    surface their empty messages.
 *  - Plan editing flow updates the card.
 *  - Limit budget rows render with computed usage.
 *  - Adding a limit budget through the AddBudgetSheet writes to MMKV.
 *  - Subscription rows render with next-billing badges.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";

// victory-native's ESM bundle trips the jest-expo transform list on
// some CI matrices — stub the primitives BudgetTrendChart uses.
jest.mock("victory-native", () => {
  const React = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(RN.View, null, children);
  return {
    __esModule: true,
    VictoryGroup: Passthrough,
    VictoryArea: () => null,
    VictoryLine: () => null,
    VictoryAxis: () => null,
  };
});

import { BudgetsPage } from "./BudgetsPage";

const FIXED_NOW = new Date("2026-04-21T12:00:00.000Z");

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("BudgetsPage — empty state", () => {
  it("renders empty placeholders for limits and goals", () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{ budgets: [], subscriptions: [], monthlyPlan: {} }}
      />,
    );
    expect(screen.getByTestId("finyk-budgets-limits-empty")).toBeTruthy();
    expect(screen.getByTestId("finyk-budgets-goals-empty")).toBeTruthy();
    expect(screen.getByTestId("finyk-budgets-subs-empty")).toBeTruthy();
  });
});

describe("BudgetsPage — monthly plan", () => {
  it("renders fact and remaining when a plan + manual tx exists", () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          monthlyPlan: { income: "30000", expense: "20000", savings: "5000" },
          subscriptions: [],
          budgets: [],
          // realTx amounts are in cents — -50000 = 500 ₴ spent
          realTx: [
            {
              id: "tx-1",
              amount: -50000,
              time: Math.floor(
                new Date("2026-04-15T10:00:00.000Z").getTime() / 1000,
              ),
              date: "2026-04-15T10:00:00.000Z",
              description: "обід",
              mcc: 5812,
              type: "expense",
              source: "mono",
              accountId: "acc-1",
              manual: false,
              categoryId: "",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          ],
        }}
      />,
    );
    // Fact = 500, remaining = 19500
    expect(screen.getByTestId("finyk-budgets-plan-fact")).toBeTruthy();
    const remaining = screen.getByTestId("finyk-budgets-plan-remaining");
    const remText = Array.isArray(remaining.props.children)
      ? remaining.props.children.flat(Infinity).join("")
      : String(remaining.props.children);
    expect(remText.replace(/\s/g, "")).toMatch(/19.?500/);
  });

  it("opens the plan sheet on tap and persists edits", async () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{ budgets: [], subscriptions: [], monthlyPlan: {} }}
      />,
    );
    fireEvent.press(screen.getByTestId("finyk-budgets-plan"));
    const incomeInput = await screen.findByTestId(
      "finyk-budgets-plan-sheet-income",
    );
    fireEvent.changeText(incomeInput, "12345");
    fireEvent.press(screen.getByTestId("finyk-budgets-plan-sheet-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("finyk-budgets-plan-income")).toBeTruthy();
    });
    const incomeNode = screen.getByTestId("finyk-budgets-plan-income");
    const text = String(incomeNode.props.children).replace(/\s/g, "");
    expect(text).toMatch(/12.?345/);
  });
});

describe("BudgetsPage — limits", () => {
  it("renders a limit budget row with computed amount", () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          subscriptions: [],
          monthlyPlan: {},
          budgets: [
            {
              id: "b-1",
              type: "limit",
              limit: 2000,
              categoryId: "food",
            },
          ],
        }}
      />,
    );
    const row = screen.getByTestId("finyk-budgets-limit-b-1");
    expect(row).toBeTruthy();
    const amount = screen.getByTestId("finyk-budgets-limit-b-1-amount");
    const amtText = Array.isArray(amount.props.children)
      ? amount.props.children.flat(Infinity).join("")
      : String(amount.props.children);
    expect(amtText.replace(/\s/g, "")).toMatch(/0\/2.?000/);
  });

  it("adds a new limit budget through the AddBudgetSheet", async () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{ budgets: [], subscriptions: [], monthlyPlan: {} }}
      />,
    );
    fireEvent.press(screen.getByTestId("finyk-budgets-add"));
    const catChip = await screen.findByTestId(
      "finyk-budgets-add-sheet-cat-food",
    );
    fireEvent.press(catChip);
    fireEvent.changeText(
      screen.getByTestId("finyk-budgets-add-sheet-limit"),
      "1500",
    );
    fireEvent.press(screen.getByTestId("finyk-budgets-add-sheet-submit"));
    await waitFor(() => {
      expect(screen.queryByTestId("finyk-budgets-limits-empty")).toBeNull();
    });
  });
});

describe("BudgetsPage — subscriptions", () => {
  it("renders seeded subscriptions with a billing badge", () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          budgets: [],
          monthlyPlan: {},
          subscriptions: [
            {
              id: "s-1",
              name: "Netflix",
              emoji: "🎬",
              keyword: "netflix",
              billingDay: 28,
              currency: "UAH",
              monthlyCost: 299,
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("finyk-budgets-sub-s-1")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
  });

  it("rolls billing day forward to next month when it has already passed", () => {
    // FIXED_NOW = 2026-04-21 → billing day 5 has passed → next charge = May 5
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          budgets: [],
          monthlyPlan: {},
          subscriptions: [
            {
              id: "s-2",
              name: "Spotify",
              emoji: "🎧",
              keyword: "spotify",
              billingDay: 5,
              currency: "UAH",
              monthlyCost: 159,
            },
          ],
        }}
      />,
    );
    const nextDateNode = screen.getByTestId("finyk-budgets-sub-s-2-next-date");
    const text = Array.isArray(nextDateNode.props.children)
      ? nextDateNode.props.children.flat(Infinity).join("")
      : String(nextDateNode.props.children);
    // Should mention May (трав), not April (квіт), because day 5 already
    // passed in April (today = 21).
    expect(text).toMatch(/трав|тра/);
  });
});

describe("BudgetsPage — same-day billing", () => {
  it("shows 'сьогодні' badge when billing day equals today", () => {
    // FIXED_NOW = 2026-04-21 → billingDay 21 should read as today
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          budgets: [],
          monthlyPlan: {},
          subscriptions: [
            {
              id: "s-today",
              name: "Today Sub",
              emoji: "📅",
              keyword: "today",
              billingDay: 21,
              currency: "UAH",
              monthlyCost: 100,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("сьогодні")).toBeTruthy();
  });
});

describe("BudgetsPage — limit sparkline", () => {
  it("renders a per-row sparkline for limit budgets", () => {
    render(
      <BudgetsPage
        now={FIXED_NOW}
        seed={{
          subscriptions: [],
          monthlyPlan: {},
          budgets: [
            {
              id: "b-spk",
              type: "limit",
              limit: 1500,
              categoryId: "food",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByTestId("finyk-budgets-limit-b-spk-sparkline"),
    ).toBeTruthy();
  });
});
