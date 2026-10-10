// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TodayOperations } from "./TodayOperations";

afterEach(cleanup);
describe("TodayOperations", () => {
  it("shows the newest operations first and preserves daily totals", () => {
    render(
      <TodayOperations
        showBalance
        onOpenToday={() => {}}
        summary={{ expense: 300, income: 1000, balance: 700 }}
        transactions={[1, 2, 3, 4].map((hour) => ({
          id: String(hour),
          description: `Operation ${hour}`,
          amount: -10000,
          time: Date.UTC(2026, 9, 10, hour) / 1000,
          date: new Date(Date.UTC(2026, 9, 10, hour)).toISOString(),
          categoryId: "food",
          type: "expense",
          source: "mono",
          mcc: 5411,
          accountId: null,
          manual: false,
          _source: "mono",
          _accountId: null,
          _manual: false,
        }))}
      />,
    );
    expect(screen.getByText("Operation 4")).toBeInTheDocument();
    expect(screen.queryByText("Operation 1")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-totals")).toHaveTextContent(
      /Витрати.*300.*Дохід.*1\s000.*Баланс.*700/,
    );
  });
});
