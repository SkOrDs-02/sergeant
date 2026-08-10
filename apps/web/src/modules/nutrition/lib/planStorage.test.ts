// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  NUTRITION_DAY_PLAN_KEY,
  NUTRITION_WEEK_PLAN_KEY,
  loadDayPlan,
  loadWeekPlan,
  saveDayPlan,
  saveWeekPlan,
} from "./planStorage";

const PLAN = {
  meals: [{ type: "breakfast", title: "Вівсянка", kcal: 420 }],
  totalKcal: 420,
};

describe("planStorage — денний план", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("переживає повний цикл запис → читання", () => {
    saveDayPlan(PLAN);
    expect(loadDayPlan()?.plan).toEqual(PLAN);
  });

  it("ставить savedAt, щоб UI колись міг показати свіжість", () => {
    const before = Date.now();
    saveDayPlan(PLAN);
    expect(loadDayPlan()?.savedAt).toBeGreaterThanOrEqual(before);
  });

  it("НЕ протухає з часом — це і був вихідний баг", () => {
    // Запис із минулого року має читатись так само. Тихе протухання для
    // тестера не відрізняється від зникнення, яке цей модуль лагодить.
    localStorage.setItem(
      NUTRITION_DAY_PLAN_KEY,
      JSON.stringify({ plan: PLAN, savedAt: 1 }),
    );
    expect(loadDayPlan()?.plan).toEqual(PLAN);
  });

  it("чистить слот, коли план знято", () => {
    saveDayPlan(PLAN);
    saveDayPlan(null);
    expect(localStorage.getItem(NUTRITION_DAY_PLAN_KEY)).toBeNull();
    expect(loadDayPlan()).toBeNull();
  });

  it("не зберігає план без страв — картка показала б порожній підсумок", () => {
    saveDayPlan({ meals: [], totalKcal: 0 });
    expect(loadDayPlan()).toBeNull();
  });

  it.each([
    ["невалідний JSON", "{не json"],
    ["не обʼєкт", '"рядок"'],
    ["без поля plan", '{"savedAt":1}'],
    ["meals не масив", '{"plan":{"meals":"нема"}}'],
  ])("віддає null на пошкоджений запис: %s", (_label, stored) => {
    localStorage.setItem(NUTRITION_DAY_PLAN_KEY, stored);
    expect(loadDayPlan()).toBeNull();
  });
});

describe("planStorage — тижневий план", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("зберігає структуру і сирий текст разом", () => {
    const plan = { days: [{ day: "Пн", meals: [] }] };
    saveWeekPlan(plan, "сирий текст");
    expect(loadWeekPlan()).toMatchObject({ plan, raw: "сирий текст" });
  });

  it("зберігає сам сирий текст, коли LLM не віддав структуру", () => {
    // `DailyPlanCard` рендерить `weekPlanRaw` саме в цьому випадку, тож
    // викидати запис без `days` означало б втратити єдине, що є на екрані.
    saveWeekPlan(null, "план текстом");
    expect(loadWeekPlan()?.raw).toBe("план текстом");
  });

  it("чистить слот, коли немає ні днів, ні тексту", () => {
    saveWeekPlan({ days: [{ day: "Пн" }] }, "");
    saveWeekPlan({ days: [] }, "");
    expect(localStorage.getItem(NUTRITION_WEEK_PLAN_KEY)).toBeNull();
  });
});
