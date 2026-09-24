// @vitest-environment jsdom
/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MealStrip, type MealStripSegment } from "./MealStrip";

const FOUR_SEGMENTS: MealStripSegment[] = [
  { type: "breakfast", label: "Сніданок", kcal: 0, count: 0 },
  { type: "lunch", label: "Обід", kcal: 0, count: 0 },
  { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
  { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
      { type: "breakfast", label: "Сніданок", kcal: 500, count: 1 },
      { type: "lunch", label: "Обід", kcal: 500, count: 1 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
      { type: "breakfast", label: "Сніданок", kcal: 300, count: 1 },
      { type: "lunch", label: "Обід", kcal: 100, count: 1 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
      { type: "breakfast", label: "Сніданок", kcal: 500, count: 1 },
      { type: "lunch", label: "Обід", kcal: 700, count: 1 },
      { type: "dinner", label: "Вечеря", kcal: 900, count: 1 },
      { type: "snack", label: "Перекус", kcal: 200, count: 1 },
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
    fireEvent.click(screen.getByRole("button", { name: "Задати ціль" }));
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
      screen.queryByRole("button", { name: "Задати ціль" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the CTA when a goal is set", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 500, count: 1 },
      { type: "lunch", label: "Обід", kcal: 0, count: 0 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
      screen.queryByRole("button", { name: "Задати ціль" }),
    ).not.toBeInTheDocument();
  });

  it("announces each meal on its own button and the remainder as the image", () => {
    // Спільний `aria-label` більше не перелічує прийоми. Сегменти стали
    // кнопками, а кнопка не може бути `aria-hidden`; факт кожного прийому
    // тепер несе доступна назва його кнопки, і дублювати ті самі слова в
    // мітці картинки означало б диктувати їх двічі.
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 520, count: 1 },
      { type: "lunch", label: "Обід", kcal: 720, count: 1 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
    // Дія у другому реченні різна, бо різна й поведінка (2026-09-15):
    // записаний прийом розгортається аркушем, порожній веде у форму.
    expect(
      screen.getByRole("button", {
        name: "Сніданок, 520 ккал. Показати записи сніданку",
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
    // тип угадував годинник (`mealTypeByNow`). Що саме відкриється —
    // рядки прийому чи форма — вирішує викликач; стрічка лише називає тип.
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

  it("вважає прийом записаним за кількістю рядків, а не за калоріями", () => {
    // Запис без макросів (фото, яке не розпізналось) дає нуль ккал, але
    // існує. За `kcal` сегмент читався б як «не записано», а тап відкривав
    // би аркуш із рядками — дві поверхні суперечили б одна одній.
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 0, count: 1 },
      { type: "lunch", label: "Обід", kcal: 0, count: 0 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
    ];
    render(
      <MealStrip
        onPickMeal={vi.fn()}
        segments={segments}
        goalKcal={2000}
        remainingLabel="лишилось сьогодні"
        macros={MACROS}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Сніданок, 0 ккал. Показати записи сніданку",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Обід не записаний. Додати в обід" }),
    ).toBeInTheDocument();
  });

  it("shows the overshoot headline honestly when consumption exceeds the goal", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 800, count: 1 },
      { type: "lunch", label: "Обід", kcal: 800, count: 1 },
      { type: "dinner", label: "Вечеря", kcal: 700, count: 1 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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
    expect(screen.getByText("ккал понад ціль")).toBeInTheDocument();
    // the "on-track" remaining caption must not also render
    expect(screen.queryByText("лишилось на перекус")).not.toBeInTheDocument();
  });

  it("renders the incomplete-day note only when passed", () => {
    const segments: MealStripSegment[] = [
      { type: "breakfast", label: "Сніданок", kcal: 400, count: 1 },
      { type: "lunch", label: "Обід", kcal: 0, count: 0 },
      { type: "dinner", label: "Вечеря", kcal: 0, count: 0 },
      { type: "snack", label: "Перекус", kcal: 0, count: 0 },
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

  // Regression PR-N7 (аудит 2026-09-13): макро-смуга без цілі малювалась
  // ПОВНОЮ на будь-якому ненульовому споживанні (`m.consumed > 0 ? 100 : 0`)
  // — візуальне «готово» там, де порівнювати немає з чим. Підпис поруч це
  // вже знав і чесно ховав знаменник, тож смуга суперечила числу над собою.
  //
  // Це НЕ та сама поведінка, що в kcal-смузі вище: та без цілі навмисно
  // розподіляє 100% МІЖ прийомами (частки одне до одного), і її тести лишені
  // без змін. Тут же кожна смуга самостійна, і ділити немає на що.
  it("не малює макро-смугу повною, коли цілі немає", () => {
    const { container } = render(
      <MealStrip
        onPickMeal={vi.fn()}
        segments={FOUR_SEGMENTS}
        goalKcal={null}
        remainingLabel="лишилось на сніданок"
        macros={[
          { label: "Білки", consumed: 12, goal: 0, unit: "г" },
          { label: "Жири", consumed: 0, goal: 0, unit: "г" },
          { label: "Вугл.", consumed: 30, goal: 0, unit: "г" },
        ]}
      />,
    );
    const bars = Array.from(
      container.querySelectorAll(
        '[role="img"][aria-label^="Білки"], [role="img"][aria-label^="Жири"], [role="img"][aria-label^="Вугл."]',
      ),
    );
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.style.width).toBe("0%");
    }
    // Саме число нікуди не дівається — його несе підпис, а не смуга.
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("макро-смуга з ціллю рахує частку як і раніше", () => {
    const { container } = render(
      <MealStrip
        onPickMeal={vi.fn()}
        segments={FOUR_SEGMENTS}
        goalKcal={2000}
        remainingLabel="лишилось на сніданок"
        macros={[{ label: "Білки", consumed: 70, goal: 140, unit: "г" }]}
      />,
    );
    const bar = container.querySelector('[role="img"][aria-label^="Білки"]');
    const fill = bar?.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });
});
