import { describe, it, expect } from "vitest";
import { getDaySummary, type Meal } from "@sergeant/nutrition-domain";
import { buildDayStrip, HOURS_IN_DAY, MIN_MEALS } from "./dayStrip";

function meal(over: Partial<Meal> & { id: string }): Meal {
  return {
    name: "Страва",
    time: "12:00",
    mealType: "lunch",
    label: "",
    macros: { kcal: 500, protein_g: null, fat_g: null, carbs_g: null },
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
    ...over,
  } as Meal;
}

describe("buildDayStrip", () => {
  it(`мовчить, поки записів менше за ${MIN_MEALS}`, () => {
    expect(buildDayStrip([])).toBeNull();
    expect(buildDayStrip([meal({ id: "a" })])).toBeNull();
  });

  it("вісь завжди 24 години, порожні теж на місці", () => {
    const strip = buildDayStrip([
      meal({ id: "dinner", time: "22:40" }),
      meal({ id: "breakfast", time: "09:10" }),
    ]);
    expect(strip?.hours).toHaveLength(HOURS_IN_DAY);
    expect(strip?.hours.map((h) => h.hour)).toEqual([...Array(24).keys()]);
    expect(strip?.filledHours).toBe(2);
    expect(strip?.hours[9]?.kcal).toBe(500);
    expect(strip?.hours[22]?.kcal).toBe(500);
    expect(strip?.hours[0]?.kcal).toBe(0);
  });

  it("два прийоми в одну годину складаються в один стовпчик", () => {
    const strip = buildDayStrip([
      meal({ id: "a", time: "13:05" }),
      meal({ id: "b", time: "13:50" }),
    ]);
    expect(strip?.filledHours).toBe(1);
    expect(strip?.hours[13]?.kcal).toBe(1000);
  });

  it("пік — найбільша ГОДИНА, а не найбільша страва", () => {
    const strip = buildDayStrip([
      meal({
        id: "small-1",
        time: "13:00",
        macros: { kcal: 300, protein_g: null, fat_g: null, carbs_g: null },
      }),
      meal({
        id: "small-2",
        time: "13:40",
        macros: { kcal: 300, protein_g: null, fat_g: null, carbs_g: null },
      }),
      meal({
        id: "big",
        time: "19:00",
        macros: { kcal: 500, protein_g: null, fat_g: null, carbs_g: null },
      }),
    ]);
    // Дві страви по 300 в одній годині важать більше за одну на 500.
    expect(strip?.peakKcal).toBe(600);
  });

  it("здогадка — лише photoAI, не recipeAI", () => {
    const strip = buildDayStrip([
      meal({ id: "photo", time: "12:00", macroSource: "photoAI" }),
      meal({ id: "recipe", time: "19:00", macroSource: "recipeAI" }),
    ]);
    expect(strip?.hours[12]?.estimatedKcal).toBe(500);
    // Рецепт має заявлені грами інгредієнтів — число виведене зі складу
    // страви, а не вгадане з пікселів. Той самий поділ, що в `getDaySummary`.
    expect(strip?.hours[19]?.estimatedKcal).toBe(0);
  });

  it("година змішаного складу тримає обидві суми окремо", () => {
    const strip = buildDayStrip([
      meal({
        id: "guess",
        time: "13:10",
        macroSource: "photoAI",
        macros: { kcal: 700, protein_g: null, fat_g: null, carbs_g: null },
      }),
      meal({
        id: "known",
        time: "13:50",
        macros: { kcal: 300, protein_g: null, fat_g: null, carbs_g: null },
      }),
    ]);
    // Штрихується частина стовпчика, а не весь стовпчик: одна вгадана
    // страва в годині не робить вгаданою всю годину.
    expect(strip?.hours[13]?.kcal).toBe(1000);
    expect(strip?.hours[13]?.estimatedKcal).toBe(700);
  });

  it("запис без часу не отримує стовпчика, але його рахують окремо", () => {
    const strip = buildDayStrip([
      meal({ id: "a", time: "08:00" }),
      meal({ id: "b", time: "13:00" }),
      meal({ id: "no-time", time: "" }),
    ]);
    expect(strip?.filledHours).toBe(2);
    expect(strip?.unplacedCount).toBe(1);
  });

  it.each(["25:00", "12:60", "noon", "1200", "12:0"])(
    "невалідний час %s йде в unplaced, а не ламає вісь",
    (time) => {
      const strip = buildDayStrip([
        meal({ id: "a", time: "08:00" }),
        meal({ id: "b", time: "13:00" }),
        meal({ id: "bad", time }),
      ]);
      expect(strip?.filledHours).toBe(2);
      expect(strip?.unplacedCount).toBe(1);
    },
  );

  it("страва без калорій не існує на смузі", () => {
    const strip = buildDayStrip([
      meal({ id: "a", time: "08:00" }),
      meal({ id: "b", time: "13:00" }),
      meal({
        id: "zero",
        time: "20:00",
        macros: { kcal: null, protein_g: 30, fat_g: null, carbs_g: null },
      }),
    ]);
    expect(strip?.filledHours).toBe(2);
    expect(strip?.hours[20]?.kcal).toBe(0);
    // І це НЕ unplaced: у неї є час, просто немає висоти.
    expect(strip?.unplacedCount).toBe(0);
  });

  /**
   * Головний інваріант, і ламається він найтихіше: смуга й дашборд
   * мусять називати ОДНЕ І ТЕ САМЕ здогадкою. Якби `dayStrip` завів
   * власний предикат, обидва показували б відсотки — просто різні, і
   * розбіжність помітили б лише на скріншоті з двома числами поруч.
   */
  it("той самий поділ на здогадки, що й у getDaySummary", () => {
    const meals = [
      meal({
        id: "photo",
        time: "09:00",
        macroSource: "photoAI",
        macros: { kcal: 900, protein_g: null, fat_g: null, carbs_g: null },
      }),
      meal({
        id: "manual",
        time: "14:00",
        macros: { kcal: 100, protein_g: null, fat_g: null, carbs_g: null },
      }),
      meal({
        id: "recipe",
        time: "19:00",
        macroSource: "recipeAI",
        macros: { kcal: 100, protein_g: null, fat_g: null, carbs_g: null },
      }),
    ];
    const strip = buildDayStrip(meals);
    const summary = getDaySummary({ "2026-08-06": { meals } }, "2026-08-06");

    const estimatedKcal = (strip?.hours ?? []).reduce(
      (s, h) => s + h.estimatedKcal,
      0,
    );
    const totalKcal = (strip?.hours ?? []).reduce((s, h) => s + h.kcal, 0);

    expect(estimatedKcal / totalKcal).toBeCloseTo(summary.estimatedKcalShare);
    // 900 з 1100 — день, угаданий на 82%, попри те що вгадана лише одна
    // страва з трьох. Саме тому частка зважена по калоріях.
    expect(summary.estimatedKcalShare).toBeCloseTo(900 / 1100);
  });
});
