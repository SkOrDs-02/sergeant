// @vitest-environment jsdom
/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Пін на регресію, яку знайшов тестер 2026-08-17: шкала без опори і
 * порожній день, що виглядає як «мало зʼїв».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeekKcalCard } from "./WeekKcalCard";
import type { MacrosRow } from "@sergeant/nutrition-domain";

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

describe("WeekKcalCard", () => {
  it("називає опору шкали ціллю, коли ціль задана", () => {
    render(<WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />);
    expect(screen.getByText(/ціль\s2\s?000/)).toBeTruthy();
  });

  it("називає стелю максимумом, коли цілі немає", () => {
    // Саме цей стан був на скріншоті тестера: цілі немає, шкала
    // самонормалізована — тож стеля мусить бути хоч підписана.
    render(<WeekKcalCard rows={WEEK} targetKcal={0} todayIso={TODAY} />);
    expect(screen.getByText(/макс\s1\s?800/)).toBeTruthy();
    expect(screen.queryByText(/ціль/)).toBeNull();
  });

  it("малює лінію цілі лише коли ціль задана", () => {
    const { container: withGoal } = render(
      <WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />,
    );
    expect(withGoal.querySelectorAll(".border-dashed").length).toBe(7);

    const { container: noGoal } = render(
      <WeekKcalCard rows={WEEK} targetKcal={0} todayIso={TODAY} />,
    );
    expect(noGoal.querySelectorAll(".border-dashed").length).toBe(0);
  });

  it("малює порожній день пласким треком, а не стовпчиком", () => {
    render(<WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />);
    expect(screen.getByTestId("week-kcal-empty-2026-08-10")).toBeTruthy();
    expect(screen.queryByTestId("week-kcal-bar-2026-08-10")).toBeNull();
    expect(screen.getByTestId("week-kcal-bar-2026-08-11")).toBeTruthy();
  });

  it("показує агрегат тижня, поки день не вибрано", () => {
    render(<WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />);
    expect(screen.getByText(/3\s?000 ккал · сер\. 1\s?500\/день/)).toBeTruthy();
  });

  it("показує ккал вибраного дня і знімає вибір повторним тапом", () => {
    render(<WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />);
    const tuesday = screen.getByRole("button", { name: /Вт, 1\s?200 ккал/ });

    fireEvent.click(tuesday);
    expect(screen.getByText(/^Вт · 1\s?200 ккал$/)).toBeTruthy();
    expect(tuesday.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(tuesday);
    expect(screen.queryByText(/^Вт · 1\s?200 ккал$/)).toBeNull();
    expect(tuesday.getAttribute("aria-pressed")).toBe("false");
  });

  it("не вигадує ккал для дня без записів при виборі", () => {
    render(<WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Пн, немає записів" }));
    expect(screen.getByText("Пн · немає записів")).toBeTruthy();
  });

  it("фарбує перебір понад ціль у warning, а не в колір модуля", () => {
    render(
      <WeekKcalCard
        rows={[row("2026-08-10", 3000)]}
        targetKcal={2000}
        todayIso={TODAY}
      />,
    );
    const bar = screen.getByTestId("week-kcal-bar-2026-08-10");
    expect(bar.className).toContain("bg-warning");
    expect(bar.className).not.toContain("bg-nutrition");
  });

  it("чесно повідомляє порожній тиждень замість порожнього графіка", () => {
    const emptyWeek = WEEK.map((r) => row(r.date, 0));
    render(<WeekKcalCard rows={emptyWeek} targetKcal={0} todayIso={TODAY} />);
    expect(screen.getByText("Ще немає записів цього тижня")).toBeTruthy();
    // Без даних і без цілі підписувати нічого — «макс 1» було б брехнею.
    expect(screen.queryByText(/макс/)).toBeNull();
  });

  it("тримає колонки поза 44px-флором через data-compact", () => {
    // Сім колонок фізично не влазять по 44px на мобільному — опт-аут
    // мусить бути на кожній, інакше падає гейт Mobile UI audit.
    const { container } = render(
      <WeekKcalCard rows={WEEK} targetKcal={2000} todayIso={TODAY} />,
    );
    expect(container.querySelectorAll("button[data-compact]").length).toBe(7);
  });

  it("дає кнопці журналу працювати", () => {
    let clicked = 0;
    render(
      <WeekKcalCard
        rows={WEEK}
        targetKcal={2000}
        todayIso={TODAY}
        onGoToLog={() => {
          clicked += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Журнал/ }));
    expect(clicked).toBe(1);
  });
});
