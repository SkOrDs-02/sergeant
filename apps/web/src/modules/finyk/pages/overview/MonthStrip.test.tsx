// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthStrip, type MonthStripDay } from "./MonthStrip";

function buildDays(daysInMonth: number, todayKey: string): MonthStripDay[] {
  const days: MonthStripDay[] = [];
  const [y = 2026, m = 6] = todayKey.split("-").map(Number);
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ dayKey, spent: 0, ratio: 0, over120: false });
  }
  return days;
}

describe("MonthStrip", () => {
  const todayKey = "2026-06-12";

  it("renders exactly daysInMonth cells", () => {
    const days = buildDays(30, todayKey);
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    const group = screen.getByRole("group");
    // Past/today are <button>, future are plain <div> placeholders — count
    // both node kinds inside the group to get daysInMonth total.
    const cellCount = group.children.length;
    expect(cellCount).toBe(30);
  });

  it("opts dense day cells out of the 44px floor via data-compact, with no overlapping hit-area", () => {
    const days = buildDays(30, todayKey);
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    // Day 12 = today, days 1..11 = past → 12 buttons total.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(12);
    for (const button of buttons) {
      // `data-compact` opts the cell OUT of the mechanical 44px floor
      // (`apps/web/tests/mobile/audit.ts` FLOOR_SELECTOR) — same pattern as
      // `HabitHeatmap`'s dense day cells. The cell itself is the tap target:
      // 44px tall, ~10.7px wide on a 393px screen.
      expect(button).toHaveAttribute("data-compact");
      // Регресія: накладка 44px ширша за колонку (~10.7px) перекриває
      // сусідів, і hit-test віддає центр дня N кнопці дня N+1 (заміряно в
      // Chromium: 30 із 31 клітинки відкривали не свій день). Юніт-клік
      // цього не бачить, тож стережемо саму наявність накладки.
      expect(button.querySelector("span.w-11, span.h-11")).toBeNull();
    }
  });

  it("renders future days as aria-hidden placeholders, not buttons", () => {
    const days = buildDays(30, todayKey);
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(12);
    const group = screen.getByRole("group");
    const futureCells = Array.from(group.children).slice(12);
    expect(futureCells).toHaveLength(18);
    for (const cell of futureCells) {
      expect(cell.tagName).toBe("DIV");
      expect(cell).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("accents the fill only when over120 is true", () => {
    const days = buildDays(12, todayKey).map((d, i) => ({
      ...d,
      ratio: 0.5,
      over120: i === 3, // day 4
    }));
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const overButton = buttons[3]!; // day 4 (index 3)
    const normalButton = buttons[0]!; // day 1
    expect(overButton.querySelector(".bg-chart-finyk")).not.toBeNull();
    expect(normalButton.querySelector(".bg-chart-finyk")).toBeNull();
    expect(normalButton.querySelector(".bg-finyk\\/50")).not.toBeNull();
  });

  it("calls onOpenDay with the tapped day-key", () => {
    const days = buildDays(30, todayKey);
    const onOpenDay = vi.fn();
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={onOpenDay}
      />,
    );
    const buttons = screen.getAllByRole("button");
    buttons[0]!.click();
    expect(onOpenDay).toHaveBeenCalledWith("2026-06-01");
    buttons[11]!.click(); // today (day 12)
    expect(onOpenDay).toHaveBeenCalledWith("2026-06-12");
  });

  it("masks the aria-label amounts when showBalance is false", () => {
    const days = buildDays(30, todayKey).map((d, i) => ({
      ...d,
      spent: i === 4 ? 250 : 0,
    }));
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance={false}
        onOpenDay={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const label = buttons[4]!.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/сума прихована/);
    expect(label).not.toMatch(/250/);
  });

  it("group carries an aria-label naming the month", () => {
    const days = buildDays(30, todayKey);
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Витрати за днями червня" }),
    ).toBeInTheDocument();
  });

  it("cell aria-label reports spent-of-dayBudget when a plan exists", () => {
    const days = buildDays(30, todayKey).map((d, i) =>
      i === 4 ? { ...d, spent: 250, ratio: 250 / 900, over120: false } : d,
    );
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={900}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[4]!.getAttribute("aria-label")).toBe(
      "5 червня, 250 ₴ із 900 ₴. Відкрити операції",
    );
  });

  it("cell aria-label falls back to «витрачено X» without a plan (dayBudget null)", () => {
    const days = buildDays(30, todayKey).map((d, i) =>
      i === 4 ? { ...d, spent: 250, ratio: 0.4, over120: false } : d,
    );
    render(
      <MonthStrip
        days={days}
        todayKey={todayKey}
        dayBudget={null}
        showBalance
        onOpenDay={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[4]!.getAttribute("aria-label")).toBe(
      "5 червня, витрачено 250 ₴. Відкрити операції",
    );
  });
});
