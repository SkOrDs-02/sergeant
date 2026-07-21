/**
 * Sergeant Routine — focused tests for extracted Calendar components.
 *
 * These components are intentionally thin, but covering them directly keeps
 * the page-level Calendar test from needing to exercise every visual state.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { DayCell } from "./DayCell";
import { MonthGridView } from "./MonthGridView";
import { MonthHeader } from "./MonthHeader";
import { WeekHeader } from "./WeekHeader";

const JAN_2025 = { y: 2025, m: 0 };

describe("Calendar extracted components", () => {
  it("DayCell renders an inert spacer for month padding", () => {
    const { queryByRole } = render(
      <DayCell
        day={null}
        cursor={JAN_2025}
        selectedDay="2025-01-15"
        todayKey="2025-01-15"
        dayCounts={new Map()}
        onSelectDay={jest.fn()}
      />,
    );

    expect(queryByRole("button")).toBeNull();
  });

  it("DayCell renders selected day state, count marker, and forwards presses", () => {
    const onSelectDay = jest.fn();
    const { getByLabelText, getByText } = render(
      <DayCell
        day={15}
        cursor={JAN_2025}
        selectedDay="2025-01-15"
        todayKey="2025-01-15"
        dayCounts={new Map([["2025-01-15", 2]])}
        onSelectDay={onSelectDay}
      />,
    );

    expect(getByText("15")).toBeTruthy();
    const button = getByLabelText("Обрати день 2025-01-15");
    expect(button.props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(button);

    expect(onSelectDay).toHaveBeenCalledWith("2025-01-15");
  });

  it("MonthHeader exposes previous, next, and today actions", () => {
    const onShift = jest.fn();
    const onToday = jest.fn();
    const { getByLabelText, getByText } = render(
      <MonthHeader cursor={JAN_2025} onShift={onShift} onToday={onToday} />,
    );

    expect(getByText("Січень 2025")).toBeTruthy();

    fireEvent.press(getByLabelText("Попередній місяць"));
    fireEvent.press(getByLabelText("Наступний місяць"));
    fireEvent.press(getByLabelText("Перейти на сьогодні"));

    expect(onShift.mock.calls).toEqual([[-1], [1]]);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("WeekHeader renders the seven Ukrainian weekday labels", () => {
    const { getByText } = render(<WeekHeader />);

    for (const label of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it("MonthGridView renders date cells for the month and delegates selection", () => {
    const onSelectDay = jest.fn();
    const { getByLabelText } = render(
      <MonthGridView
        cursor={JAN_2025}
        selectedDay="2025-01-15"
        todayKey="2025-01-21"
        dayCounts={new Map([["2025-01-15", 1]])}
        onSelectDay={onSelectDay}
      />,
    );

    fireEvent.press(getByLabelText("Обрати день 2025-01-15"));

    expect(onSelectDay).toHaveBeenCalledWith("2025-01-15");
  });
});
