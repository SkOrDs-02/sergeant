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
        onPickMeal={vi.fn()}
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
        onPickMeal={vi.fn()}
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    const fills = container.querySelectorAll('[data-testid="meal-strip-fill"]');
    // Пропорція тепер живе всередині колонки фіксованої ширини: заливка
    // на `share` = частка прийому в зʼїденому за день. Колонки рівні, тож
    // підпис не обрізається, а порівняння прийомів лишається видимим.
    expect(fills).toHaveLength(4);
    expect((fills[0] as HTMLElement).style.width).toBe("50%");
    expect((fills[1] as HTMLElement).style.width).toBe("50%");
    expect((fills[2] as HTMLElement).style.width).toBe("0%");
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
        onPickMeal={vi.fn()}
        segments={segments}
        goalKcal={null}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    const fills = container.querySelectorAll('[data-testid="meal-strip-fill"]');
    // proportional to consumed share (300 / 100 / 0 / 0), not equal 25% each
    expect((fills[0] as HTMLElement).style.width).toBe("75%");
    expect((fills[1] as HTMLElement).style.width).toBe("25%");
  });

  it("draws no fill at all on a fully empty day (no goal)", () => {
    const { container } = render(
      <MealStrip
        onPickMeal={vi.fn()}
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={MACROS}
        onSetGoal={vi.fn()}
      />,
    );
    const fills = container.querySelectorAll('[data-testid="meal-strip-fill"]');
    // Порожній день — жодної заливки; фон колонки сам показує «нічого
    // немає». Попередня версія цієї перевірки була беззмістовною: селектор
    // після переходу на `<li>` не знаходив нічого, і цикл не виконувався
    // жодного разу — тест «проходив», не перевіривши нічого.
    expect(fills).toHaveLength(4);
    for (const fill of fills) {
      expect((fill as HTMLElement).style.width).toBe("0%");
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
        onPickMeal={vi.fn()}
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось сьогодні"
        macros={MACROS}
      />,
    );
    const fills = container.querySelectorAll('[data-testid="meal-strip-fill"]');
    // cumulative: 500, 1200, 2100 (> 2000 here — dinner crosses), 2300
    expect((fills[2] as HTMLElement).className).toContain("bg-nutrition");
    expect((fills[0] as HTMLElement).className).not.toContain("bg-nutrition");
    expect((fills[1] as HTMLElement).className).not.toContain("bg-nutrition");
    expect((fills[3] as HTMLElement).className).not.toContain("bg-nutrition");
  });

  it("shows the set-goal CTA and calls onSetGoal when there is no norm", () => {
    const onSetGoal = vi.fn();
    render(
      <MealStrip
        onPickMeal={vi.fn()}
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
        onPickMeal={vi.fn()}
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
        onPickMeal={vi.fn()}
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

  it("announces each meal on its own button and the remainder as the image", () => {
    // Спільний `aria-label` більше не перелічує прийоми. Сегменти стали
    // кнопками, а кнопка не може бути `aria-hidden`; факт кожного прийому
    // тепер несе доступна назва його кнопки, і дублювати ті самі слова в
    // мітці картинки означало б диктувати їх двічі.
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 520 },
      { type: "lunch", label: "Обід", kcal: 720 },
      { type: "dinner", label: "Вечеря", kcal: 0 },
      { type: "snack", label: "Перекус", kcal: 0 },
    ];
    render(
      <MealStrip
        onPickMeal={vi.fn()}
        segments={segments}
        goalKcal={2200}
        remainingLabel="лишилось на вечерю"
        macros={MACROS}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Сніданок, 520 ккал. Додати в сніданок",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Вечеря не записана. Додати у вечерю",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Лишилось 960 ккал на вечерю" }),
    ).toBeInTheDocument();
  });

  it("opens the meal type the tapped segment stands for", () => {
    // Корінь знахідки власника: hero був індикатором, з якого нічого не
    // зробиш. Єдиною дією лишався FAB, а він відкриває аркуш БЕЗ типу —
    // тип угадував годинник (`mealTypeByNow`).
    const onPickMeal = vi.fn();
    render(
      <MealStrip
        onPickMeal={onPickMeal}
        segments={FOUR_SEGMENTS}
        goalKcal={2000}
        remainingLabel="лишилось сьогодні"
        macros={MACROS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Обід не записаний/ }));
    expect(onPickMeal).toHaveBeenCalledWith("lunch");
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
        onPickMeal={vi.fn()}
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
        onPickMeal={vi.fn()}
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
