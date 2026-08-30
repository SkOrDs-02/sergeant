import { render } from "@testing-library/react-native";

import type { MacrosRow } from "@sergeant/nutrition-domain";

import { WeekKcalChart } from "../WeekKcalChart";

function row(date: string, kcal: number): MacrosRow {
  return { date, kcal, protein_g: 0, fat_g: 0, carbs_g: 0 };
}

// 2026-08-10 — понеділок.
const WEEK: MacrosRow[] = [
  row("2026-08-10", 0),
  row("2026-08-11", 1200),
  row("2026-08-12", 1800),
  row("2026-08-13", 0),
  row("2026-08-14", 0),
  row("2026-08-15", 0),
  row("2026-08-16", 0),
];

const TODAY = "2026-08-12";

describe("WeekKcalChart", () => {
  it("малює порожній день пласким треком, а не стовпчиком", () => {
    // Канон §5.2: пропуск — це неповні дані, а не «мало зʼїв».
    const { getByTestId, queryByTestId } = render(
      <WeekKcalChart rows={WEEK} targetKcal={2000} todayIso={TODAY} />,
    );

    expect(getByTestId("week-kcal-empty-2026-08-10")).toBeTruthy();
    expect(queryByTestId("week-kcal-bar-2026-08-10")).toBeNull();
    expect(getByTestId("week-kcal-bar-2026-08-11")).toBeTruthy();
  });

  it("називає опору шкали ціллю, коли ціль задана", () => {
    const { getByText } = render(
      <WeekKcalChart rows={WEEK} targetKcal={2000} todayIso={TODAY} />,
    );

    expect(getByText(/ціль\s2\s?000/)).toBeTruthy();
  });

  it("називає стелю максимумом, коли цілі немає", () => {
    const { getByText, queryByText } = render(
      <WeekKcalChart rows={WEEK} targetKcal={0} todayIso={TODAY} />,
    );

    expect(getByText(/макс\s1\s?800/)).toBeTruthy();
    expect(queryByText(/ціль/)).toBeNull();
  });

  it("показує агрегат тижня по днях із записами", () => {
    const { getByText } = render(
      <WeekKcalChart rows={WEEK} targetKcal={2000} todayIso={TODAY} />,
    );

    expect(getByText(/3\s?000 ккал · сер\. 1\s?500\/день/)).toBeTruthy();
  });

  it("чесно повідомляє порожній тиждень", () => {
    const { getByText } = render(
      <WeekKcalChart
        rows={WEEK.map((r) => row(r.date, 0))}
        targetKcal={0}
        todayIso={TODAY}
      />,
    );

    expect(getByText("Ще немає записів цього тижня")).toBeTruthy();
  });
});
