// @vitest-environment jsdom
/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MealStrip, type MealStripSegment } from "./MealStrip";

const FOUR_SEGMENTS: MealStripSegment[] = [
  { type: "breakfast", label: "Сніданок", kcal: 0 },
  { type: "lunch", label: "Обід", kcal: 0 },
  { type: "dinner", label: "Вечеря", kcal: 0 },
  { type: "snack", label: "Перекус", kcal: 0 },
];

const MACROS = [
  { label: "Білки", consumed: 62, goal: 140, unit: "г" },
  { label: "Жири", consumed: 41, goal: 70, unit: "г" },
  { label: "Вугл.", consumed: 150, goal: 240, unit: "г" },
];

describe("MealStrip", () => {
  it("always renders four segment positions, even on an empty day", () => {
    render(
      <MealStrip
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={MACROS}
      />,
    );
    expect(screen.getByText("Сніданок")).toBeInTheDocument();
    expect(screen.getByText("Обід")).toBeInTheDocument();
    expect(screen.getByText("Вечеря")).toBeInTheDocument();
    expect(screen.getByText("Перекус")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("proportions segment width to kcal when a goal is set", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 500 },
      { type: "lunch", label: "Обід", kcal: 500 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    const { container } = render(
      <MealStrip
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    const bars = container.querySelectorAll(
      '[data-testid="meal-strip-bars"] > div',
    );
    expect(bars).toHaveLength(4);
    expect((bars[0] as HTMLElement).style.flexGrow).toBe("500");
    expect((bars[1] as HTMLElement).style.flexGrow).toBe("500");
    // empty segments keep a near-zero grow (min-width floor does the rest)
    expect(Number((bars[2] as HTMLElement).style.flexGrow)).toBeLessThan(1);
  });

  it("proportions the strip to 100% of eaten kcal when there is no goal", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 300 },
      { type: "lunch", label: "Обід", kcal: 100 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    const { container } = render(
      <MealStrip
        segments={segments}
        goalKcal={null}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    const bars = container.querySelectorAll(
      '[data-testid="meal-strip-bars"] > div',
    );
    // proportional to consumed share (300 / 100 / 0 / 0), not equal 25% each
    expect((bars[0] as HTMLElement).style.flexGrow).toBe("300");
    expect((bars[1] as HTMLElement).style.flexGrow).toBe("100");
  });

  it("gives every segment equal width on a fully empty day (no goal)", () => {
    const { container } = render(
      <MealStrip
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={MACROS}
        onSetGoal={vi.fn()}
      />,
    );
    const bars = container.querySelectorAll(
      '[data-testid="meal-strip-bars"] > div',
    );
    for (const bar of bars) {
      expect((bar as HTMLElement).style.flexGrow).toBe("1");
    }
  });

  it("accents only the segment that crosses the norm boundary", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 500 },
      { type: "lunch", label: "Обід", kcal: 700 },
      { type: "dinner", label: "Вечеря", kcal: 900 },
      { type: "snack", label: "Перекус", kcal: 200 },
    ];
    const { container } = render(
      <MealStrip
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось сьогодні"
        macros={MACROS}
      />,
    );
    const bars = container.querySelectorAll(
      '[data-testid="meal-strip-bars"] > div',
    );
    // cumulative: 500, 1200, 2100 (> 2000 here — dinner crosses), 2300
    expect((bars[2] as HTMLElement).className).toContain("bg-nutrition");
    expect((bars[0] as HTMLElement).className).not.toContain("bg-nutrition");
    expect((bars[1] as HTMLElement).className).not.toContain("bg-nutrition");
    expect((bars[3] as HTMLElement).className).not.toContain("bg-nutrition");
  });

  it("shows the set-goal CTA and calls onSetGoal when there is no norm", () => {
    const onSetGoal = vi.fn();
    render(
      <MealStrip
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={MACROS}
        onSetGoal={onSetGoal}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Задати норму" }));
    expect(onSetGoal).toHaveBeenCalledTimes(1);
  });

  it("hides the CTA when there is no norm and no navigation handler", () => {
    // Увімкнена кнопка без обробника — це «мертвий» елемент: виглядає
    // клікабельною і нічого не робить. Порожній стан лишається чесним.
    render(
      <MealStrip
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={MACROS}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Задати норму" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the CTA when a goal is set", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 500 },
      { type: "lunch", label: "Обід", kcal: 0 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    render(
      <MealStrip
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось на обід"
        macros={MACROS}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Задати норму" }),
    ).not.toBeInTheDocument();
  });

  it("builds the documented aria-label sentence for the mockup demo state", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 520 },
      { type: "lunch", label: "Обід", kcal: 720 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    render(
      <MealStrip
        segments={segments}
        goalKcal={2200}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "Сніданок 520 ккал, обід 720 ккал, вечеря не записана, перекус не записаний, лишилось 960 ккал на вечерю",
      }),
    ).toBeInTheDocument();
  });

  it("shows the overshoot headline honestly when consumption exceeds the goal", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 800 },
      { type: "lunch", label: "Обід", kcal: 800 },
      { type: "dinner", label: "Вечеря", kcal: 700 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    render(
      <MealStrip
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось на перекус"
        macros={MACROS}
      />,
    );
    expect(screen.getByText("−300")).toBeInTheDocument();
    expect(screen.getByText("ккал понад норму")).toBeInTheDocument();
    // the "on-track" remaining caption must not also render
    expect(screen.queryByText("лишилось на перекус")).not.toBeInTheDocument();
  });

  it("renders the incomplete-day note only when passed", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 400 },
      { type: "lunch", label: "Обід", kcal: 0 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    render(
      <MealStrip
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось на обід"
        macros={MACROS}
        incompleteNote="Записано 1 із 4"
      />,
    );
    expect(screen.getByText("Записано 1 із 4")).toBeInTheDocument();
  });
});
