// @vitest-environment jsdom
/**
 * Гребінь місяця — вид. Тести тримають три речі, які легко зламати
 * непомітно: пороги показу, приховування при схованому балансі й
 * контракт доступності (сітка не для скрінрідера, факти — текстом).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MonthOutflowComb } from "./MonthOutflowComb";
import { MIN_ENTRIES, type CombEntry } from "../lib/monthOutflowComb";

const sub = (
  id: string,
  billingDay: number,
  amount: number | null,
): CombEntry => ({
  id,
  name: id,
  billingDay,
  amount,
});

/** Рівно стільки платежів, скільки треба, щоб вид зʼявився. */
const enough: CombEntry[] = [
  sub("Netflix", 3, 399),
  sub("Spotify", 5, 159),
  sub("Київстар", 6, 300),
  sub("Комуналка", 8, 2400),
];

describe("MonthOutflowComb", () => {
  it("renders once there are enough payments", () => {
    render(<MonthOutflowComb entries={enough} daysInMonth={31} today={7} />);
    expect(
      screen.getByLabelText("Регулярні списання по днях місяця"),
    ).toBeInTheDocument();
  });

  // AI-CONTEXT: поріг — не косметика. Нижче за нього гребінь показує
  // кілька рисок і багато повітря, тобто гірший за список, який під ним.
  it("renders nothing below the entry threshold", () => {
    const { container } = render(
      <MonthOutflowComb
        entries={enough.slice(0, MIN_ENTRIES - 1)}
        daysInMonth={31}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("counts only payments with a known amount towards the threshold", () => {
    const withUnknowns = [...enough.slice(0, 3), sub("iCloud", 24, null)];
    const { container } = render(
      <MonthOutflowComb entries={withUnknowns} daysInMonth={31} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Висота стовпчика кодує суму, тож «форма без чисел» тут неможлива —
  // вона й Є число.
  it("renders nothing when the balance is hidden", () => {
    const { container } = render(
      <MonthOutflowComb
        entries={enough}
        daysInMonth={31}
        showBalance={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws one column per day of the month", () => {
    const { container } = render(
      <MonthOutflowComb entries={enough} daysInMonth={30} />,
    );
    const grid = container.querySelector<HTMLElement>("[style*='--comb-days']");
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(30);
    expect(grid?.style.getPropertyValue("--comb-days")).toBe("30");
  });

  it("states the peak day and the gap in text for assistive tech", () => {
    render(<MonthOutflowComb entries={enough} daysInMonth={31} />);
    // Пік — 8-го (Комуналка, 2400), провал — 9..31.
    expect(
      screen.getByText(/Найбільше списань 8-го числа/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Найдовший проміжок без списань: 23 дні,/),
    ).toBeInTheDocument();
  });

  it("shows the gap as a visible line too, not only for screen readers", () => {
    render(<MonthOutflowComb entries={enough} daysInMonth={31} />);
    expect(
      screen.getByText(/23 дні поспіль без списань: з 9-го по 31-е/),
    ).toBeInTheDocument();
  });

  // AI-CONTEXT: тест на відмінювання стоїть окремо, бо перша редакція
  // цього компонента писала «днів» завжди — і на 23 днях це помилка
  // української, яку в ревʼю легко пропустити.
  it("declines the day count instead of hardcoding one form", () => {
    // Платежі 3, 5, 6, 8, 10 у 15-денному вікні → найдовший провал
    // 11..15 = рівно 5 днів, тобто саме на порозі MIN_GAP_DAYS.
    // 5 → «днів», тоді як 23 у тесті вище → «дні».
    render(
      <MonthOutflowComb
        entries={[...enough, sub("iCloud", 10, 99)]}
        daysInMonth={15}
      />,
    );
    expect(
      screen.getByText(/5 днів поспіль без списань: з 11-го по 15-е/),
    ).toBeInTheDocument();
  });

  it("marks income days without giving them a bar", () => {
    const { container } = render(
      <MonthOutflowComb
        entries={enough}
        daysInMonth={31}
        incomeDays={[2, 17]}
      />,
    );
    const grid = container.querySelector<HTMLElement>("[style*='--comb-days']");
    const cols = Array.from(grid?.children ?? []);
    // 2-ге і 17-те — мітки доходу, хоч списань там немає.
    expect(cols[1]?.querySelector(".bg-success-strong")).not.toBeNull();
    expect(cols[16]?.querySelector(".bg-success-strong")).not.toBeNull();
    // 3-тє має стовпчик списання, але мітки доходу — ні.
    expect(cols[2]?.querySelector(".bg-success-strong")).toBeNull();
  });

  // AI-CONTEXT: тест на те, що дохід НЕ ділить шкалу з відтоком.
  // Зарплата на порядок більша за будь-яке списання; якби мітка стала
  // пропорційним стовпчиком, вона б стала стелею, а весь відтік —
  // смужкою біля нуля. Мітка має фіксовану висоту й не залежить від сум.
  it("keeps the income marker out of the height scale", () => {
    const { container } = render(
      <MonthOutflowComb entries={enough} daysInMonth={31} incomeDays={[2]} />,
    );
    const marker = container.querySelector<HTMLElement>(".bg-success-strong");
    expect(marker).not.toBeNull();
    expect(marker?.style.height).toBe("");
  });

  it("announces income days to assistive tech", () => {
    render(
      <MonthOutflowComb
        entries={enough}
        daysInMonth={31}
        incomeDays={[17, 2]}
      />,
    );
    // Відсортовано за зростанням, незалежно від порядку на вході.
    expect(
      screen.getByText(/Регулярні надходження: 2, 17 числа/),
    ).toBeInTheDocument();
  });

  // Сітка навмисно `aria-hidden`: 31 фокусований стовпчик зробив би
  // обхід із клавіатури довшим за читання списку.
  it("keeps the bar grid out of the accessibility tree", () => {
    const { container } = render(
      <MonthOutflowComb entries={enough} daysInMonth={31} />,
    );
    const grid = container.querySelector("[style*='--comb-days']");
    expect(grid?.getAttribute("aria-hidden")).toBe("true");
  });
});
