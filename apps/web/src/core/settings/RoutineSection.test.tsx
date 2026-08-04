/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Покриття блоку «Рутина» в Налаштуваннях після 2026-08-03: тут лишились
 * календарні тумблери + теги/категорії. Керування звичками (список,
 * порядок, архів, видалення) переїхало у вкладку модуля — його покриття
 * живе в `modules/routine/components/RoutineHabitsPanel.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const routineState = vi.hoisted(() => ({
  routine: {
    prefs: {} as Record<string, unknown>,
  },
  setRoutine: vi.fn(),
  updatePref: vi.fn(),
}));
vi.mock("../../modules/routine/hooks/useRoutineState", () => ({
  useRoutineState: () => routineState,
}));

vi.mock("../../modules/routine/components/settings/TagsSection", () => ({
  TagsSection: () => <div data-testid="tags-section" />,
}));
vi.mock("../../modules/routine/components/settings/CategoriesSection", () => ({
  CategoriesSection: () => <div data-testid="categories-section" />,
}));

import { RoutineSection } from "./RoutineSection";

describe("RoutineSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineState.routine = { prefs: {} };
  });

  afterEach(() => cleanup());

  it("renders the calendar toggles and the tags/categories subgroup", () => {
    render(<RoutineSection />);
    expect(
      screen.getByText("Показувати тренування з Фізрука в календарі"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tags-section")).toBeInTheDocument();
    expect(screen.getByTestId("categories-section")).toBeInTheDocument();
  });

  it("no longer hosts habit management — that moved into the module", () => {
    render(<RoutineSection />);
    expect(screen.queryByText("Активні звички")).not.toBeInTheDocument();
    expect(screen.queryByText("Архів")).not.toBeInTheDocument();
  });

  it("defaults the Fizruk-in-calendar toggle to on when pref is unset", () => {
    render(<RoutineSection />);
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toBeChecked();
  });

  it("reflects an explicit false pref as an off toggle", () => {
    routineState.routine = { prefs: { showFizrukInCalendar: false } };
    render(<RoutineSection />);
    expect(screen.getAllByRole("switch")[0]).not.toBeChecked();
  });

  it("calls updatePref when toggling the Fizruk calendar switch", () => {
    routineState.routine = { prefs: { showFizrukInCalendar: false } };
    render(<RoutineSection />);
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(routineState.updatePref).toHaveBeenCalledWith(
      "showFizrukInCalendar",
      true,
    );
  });

  it("calls updatePref for the Finyk-subscriptions calendar switch", () => {
    render(<RoutineSection />);
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(routineState.updatePref).toHaveBeenCalledWith(
      "showFinykSubscriptionsInCalendar",
      false,
    );
  });
});
