// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Insight } from "@shared/lib/insights/types";

const navigateMock = vi.fn();
let overrunInsight: Insight | null = null;
let coffeeInsight: Insight | null = null;
let recurringInsight: Insight | null = null;

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@shared/components/ui/InsightCard", () => ({
  InsightCard: ({
    title,
    onActivate,
  }: {
    title: string;
    onActivate: () => void;
  }) => (
    <button type="button" onClick={onActivate}>
      {title}
    </button>
  ),
}));

vi.mock("../hooks/useBudgetOverrunInsight", () => ({
  useBudgetOverrunInsight: () => overrunInsight,
}));

vi.mock("../hooks/useCoffeeLimitInsight", () => ({
  useCoffeeLimitInsight: () => coffeeInsight,
}));

vi.mock("../hooks/useRecurringDetectedInsight", () => ({
  useRecurringDetectedInsight: () => recurringInsight,
}));

import { FinykInsightsBlock } from "./FinykInsightsBlock";

function insight(id: string, action: Insight["action"]): Insight {
  return {
    id,
    module: "finyk",
    title: `Insight ${id}`,
    subtitle: "Branch coverage",
    action,
    showOn: "module",
  };
}

function renderBlock() {
  return render(
    <MemoryRouter>
      <FinykInsightsBlock
        transactions={[]}
        budgets={[]}
        txCategories={{}}
        txSplits={{}}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  overrunInsight = null;
  coffeeInsight = null;
  recurringInsight = null;
});

describe("FinykInsightsBlock activation branches", () => {
  it("prioritizes the first two insights and navigates for navigate actions", () => {
    overrunInsight = insight("overrun", {
      type: "navigate",
      path: "/finyk/budgets",
    });
    coffeeInsight = insight("coffee", {
      type: "navigate",
      path: "/finyk/analytics",
    });
    recurringInsight = insight("recurring", {
      type: "navigate",
      path: "/finyk/assets",
    });

    renderBlock();

    expect(screen.getByText("Insight overrun")).toBeInTheDocument();
    expect(screen.getByText("Insight coffee")).toBeInTheDocument();
    expect(screen.queryByText("Insight recurring")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Insight overrun"));
    expect(navigateMock).toHaveBeenCalledWith("/finyk/budgets");
  });

  it("runs callback actions without navigating", () => {
    const fn = vi.fn();
    overrunInsight = insight("callback", { type: "callback", fn });

    renderBlock();

    fireEvent.click(screen.getByText("Insight callback"));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
