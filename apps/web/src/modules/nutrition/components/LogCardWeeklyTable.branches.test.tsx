// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NutritionLog } from "@sergeant/nutrition-domain";
import { LogCardWeeklyTable } from "./LogCardWeeklyTable";

const LOG = {
  "2026-07-09": {
    meals: [
      {
        id: "m1",
        time: "08:00",
        name: "Сніданок",
        macros: { kcal: 400, protein_g: 20, fat_g: 10, carbs_g: 45 },
      },
    ],
  },
} as unknown as NutritionLog;

describe("LogCardWeeklyTable", () => {
  it("hides weekly table until toggled open", () => {
    render(<LogCardWeeklyTable log={LOG} selectedDate="2026-07-09" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Журнал за тиждень/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("повідомляє про згорнуту/розгорнуту таблицю через aria-expanded", () => {
    // Регресія WF-13 (аудит 2026-09-16): тогл керував таблицею, але
    // єдиним натяком був шеврон, а він декоративний.
    render(<LogCardWeeklyTable log={LOG} selectedDate="2026-07-09" />);
    const toggle = screen.getByRole("button", { name: /Журнал за тиждень/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // `aria-controls` мусить вказувати на РЕАЛЬНИЙ вузол, інакше це
    // обіцянка без адресата.
    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it("рахує календарний тиждень Пн-Нд обраного дня з людськими датами", () => {
    // 2026-07-09 — четвер: тиждень 06.07 (Пн) … 12.07 (Нд), а не 03.07–09.07.
    render(<LogCardWeeklyTable log={LOG} selectedDate="2026-07-09" />);
    fireEvent.click(screen.getByRole("button", { name: /Журнал за тиждень/ }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0]!.textContent).toMatch(/^пн, 6 лип/);
    expect(rows[6]!.textContent).toMatch(/^нд, 12 лип/);
    // Сирий ключ «07-06» більше не показується.
    expect(screen.queryByText("07-06")).toBeNull();
  });

  it("порожній день каже «немає записів», а не «0»", () => {
    render(<LogCardWeeklyTable log={LOG} selectedDate="2026-07-09" />);
    fireEvent.click(screen.getByRole("button", { name: /Журнал за тиждень/ }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("немає записів");
    expect(rows[0]!.textContent).not.toMatch(/\b0\b/);
    // Четвер із записом: числа на місці.
    expect(rows[3]!.textContent).toContain("400");
  });
});
