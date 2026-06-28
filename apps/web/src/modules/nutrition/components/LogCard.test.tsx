// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `LogCard` (date nav + duplicate/trim flows + empty state).
 * Child sections are stubbed; their behaviour is covered elsewhere.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./LogCardSearch", () => ({
  LogCardSearch: () => <div data-testid="log-search" />,
}));
vi.mock("./LogCardWeeklyTable", () => ({
  LogCardWeeklyTable: () => <div data-testid="log-weekly" />,
}));
vi.mock("./LogCardAnalytics", () => ({
  LogCardAnalytics: () => <div data-testid="log-analytics" />,
}));
vi.mock("./VirtualMealList", () => ({
  VirtualMealList: () => <div data-testid="virtual-meals" />,
}));
vi.mock("../lib/nutritionStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/nutritionStorage")
  >("../lib/nutritionStorage");
  return { ...actual, estimateLogBytes: vi.fn(() => 1000) };
});

import { estimateLogBytes } from "../lib/nutritionStorage";
import { LogCard } from "./LogCard";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { addDaysISODate } from "@sergeant/nutrition-domain";

const today = getKyivDayKey();

function renderLog(overrides: Record<string, unknown> = {}) {
  const setSelectedDate = vi.fn();
  const props = {
    log: {} as never,
    selectedDate: today,
    setSelectedDate,
    onAddMeal: vi.fn(),
    ...overrides,
  };
  const Comp = LogCard as (p: typeof props) => ReactElement;
  render(<Comp {...props} />);
  return props;
}

afterEach(() => vi.clearAllMocks());

describe("LogCard", () => {
  it("renders 'Сьогодні' and the empty state with no meals", () => {
    renderLog();
    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
    expect(screen.getByText("Поки немає записів")).toBeInTheDocument();
  });

  it("shifts the selected date back and forward", () => {
    const { setSelectedDate } = renderLog();
    fireEvent.click(screen.getByLabelText("Попередній день"));
    fireEvent.click(screen.getByLabelText("Наступний день"));
    expect(setSelectedDate).toHaveBeenCalledTimes(2);
  });

  it("renders the meal list when meals exist", () => {
    renderLog({
      log: {
        [today]: { meals: [{ id: "m1", name: "Обід", mealType: "lunch" }] },
      } as never,
    });
    expect(screen.getByTestId("virtual-meals")).toBeInTheDocument();
  });

  it("invokes onAddMeal", () => {
    const onAddMeal = vi.fn();
    renderLog({ onAddMeal });
    fireEvent.click(screen.getByText("+ Додати прийом їжі"));
    expect(onAddMeal).toHaveBeenCalled();
  });

  it("shows and confirms the duplicate-yesterday flow", () => {
    const onDuplicateYesterday = vi.fn();
    // Use the same date helper the component uses (addDaysISODate) so the key
    // matches its `previousDayIso` regardless of host timezone.
    const yesterday = addDaysISODate(today, -1);
    renderLog({
      onDuplicateYesterday,
      log: {
        [yesterday]: {
          meals: [{ id: "y1", name: "Вчора", mealType: "lunch" }],
        },
      } as never,
    });
    fireEvent.click(screen.getByText(/Скопіювати з попереднього дня/));
    fireEvent.click(screen.getByText("Скопіювати"));
    expect(onDuplicateYesterday).toHaveBeenCalled();
  });

  it("shows the big-log warning and confirms trim", () => {
    (estimateLogBytes as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      400_000,
    );
    const onTrimLog = vi.fn();
    renderLog({ onTrimLog });
    fireEvent.click(screen.getByText(/Залишити лише останні 365 днів/));
    fireEvent.click(screen.getByText("Видалити"));
    expect(onTrimLog).toHaveBeenCalledWith(365);
  });
});
