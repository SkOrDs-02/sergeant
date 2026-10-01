// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NUTRITION_DAY_PLAN_KEY,
  loadDayPlan,
  loadWeekPlan,
  saveDayPlan,
  saveWeekPlan,
} from "./planStorage";

const PLAN = {
  meals: [{ type: "breakfast", title: "Вівсянка", kcal: 420 }],
  totalKcal: 420,
};

const OWNER_A = "account-a";
const OWNER_B = "account-b";
const ANONYMOUS_OWNER = "local-anon";

describe("planStorage — денний план", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("переживає повний цикл запис → читання", () => {
    saveDayPlan(PLAN, OWNER_A);
    expect(loadDayPlan(OWNER_A)?.plan).toEqual(PLAN);
  });

  it("не показує план account A після expired/anonymous сесії та входу account B", () => {
    saveDayPlan(PLAN, OWNER_A);

    expect(loadDayPlan(ANONYMOUS_OWNER)).toBeNull();
    expect(loadDayPlan(OWNER_B)).toBeNull();
    expect(loadDayPlan(OWNER_A)?.plan).toEqual(PLAN);
  });

  it("переносить новий анонімний план першому account після входу", () => {
    saveDayPlan(PLAN, ANONYMOUS_OWNER);

    expect(loadDayPlan(OWNER_B, true)?.plan).toEqual(PLAN);
    expect(loadDayPlan(ANONYMOUS_OWNER)).toBeNull();
  });

  it("не залишає анонімний план для наступного account, якщо у першого вже є новіший", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10);
    saveDayPlan(PLAN, ANONYMOUS_OWNER);
    const newerPlan = { ...PLAN, note: "account B" };
    clock.mockReturnValue(20);
    saveDayPlan(newerPlan, OWNER_B);

    expect(loadDayPlan(OWNER_B, true)?.plan).toEqual(newerPlan);
    expect(loadDayPlan("account-c", true)).toBeNull();
    clock.mockRestore();
  });

  it("не приписує legacy-запис без owner наступному account", () => {
    localStorage.setItem(
      NUTRITION_DAY_PLAN_KEY,
      JSON.stringify({ plan: PLAN, savedAt: 1 }),
    );

    expect(loadDayPlan(OWNER_B)).toBeNull();
    expect(localStorage.getItem(NUTRITION_DAY_PLAN_KEY)).toBeNull();
  });

  it("ставить savedAt, щоб UI колись міг показати свіжість", () => {
    const before = Date.now();
    saveDayPlan(PLAN, OWNER_A);
    expect(loadDayPlan(OWNER_A)?.savedAt).toBeGreaterThanOrEqual(before);
  });

  it("НЕ протухає з часом — це і був вихідний баг", () => {
    // Запис із минулого року має читатись так само. Тихе протухання для
    // тестера не відрізняється від зникнення, яке цей модуль лагодить.
    const now = vi.spyOn(Date, "now").mockReturnValue(1);
    saveDayPlan(PLAN, OWNER_A);
    now.mockRestore();
    expect(loadDayPlan(OWNER_A)?.plan).toEqual(PLAN);
    expect(loadDayPlan(OWNER_A)?.savedAt).toBe(1);
  });

  it("чистить слот, коли план знято", () => {
    saveDayPlan(PLAN, OWNER_A);
    saveDayPlan(null, OWNER_A);
    expect(loadDayPlan(OWNER_A)).toBeNull();
  });

  it("не зберігає план без страв — картка показала б порожній підсумок", () => {
    saveDayPlan({ meals: [], totalKcal: 0 }, OWNER_A);
    expect(loadDayPlan(OWNER_A)).toBeNull();
  });

  it.each([
    ["невалідний JSON", "{не json"],
    ["не обʼєкт", '"рядок"'],
    ["без поля plan", '{"savedAt":1}'],
    ["meals не масив", '{"plan":{"meals":"нема"}}'],
  ])("віддає null на пошкоджений запис: %s", (_label, stored) => {
    saveDayPlan(PLAN, OWNER_A);
    const key = localStorage.key(0);
    expect(key).not.toBeNull();
    localStorage.setItem(key!, stored);
    expect(loadDayPlan(OWNER_A)).toBeNull();
  });
});

describe("planStorage — тижневий план", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("зберігає структуру і сирий текст разом", () => {
    const plan = { days: [{ day: "Пн", meals: [] }] };
    saveWeekPlan(plan, "сирий текст", OWNER_A);
    expect(loadWeekPlan(OWNER_A)).toMatchObject({
      plan,
      raw: "сирий текст",
    });
  });

  it("ізолює тижневий план між account A та account B", () => {
    const plan = { days: [{ day: "Пн", meals: [] }] };
    saveWeekPlan(plan, "account A", OWNER_A);

    expect(loadWeekPlan(ANONYMOUS_OWNER)).toBeNull();
    expect(loadWeekPlan(OWNER_B)).toBeNull();
    expect(loadWeekPlan(OWNER_A)?.raw).toBe("account A");
  });

  it("зберігає сам сирий текст, коли LLM не віддав структуру", () => {
    // `DailyPlanCard` рендерить `weekPlanRaw` саме в цьому випадку, тож
    // викидати запис без `days` означало б втратити єдине, що є на екрані.
    saveWeekPlan(null, "план текстом", OWNER_A);
    expect(loadWeekPlan(OWNER_A)?.raw).toBe("план текстом");
  });

  it("чистить слот, коли немає ні днів, ні тексту", () => {
    saveWeekPlan({ days: [{ day: "Пн" }] }, "", OWNER_A);
    saveWeekPlan({ days: [] }, "", OWNER_A);
    expect(loadWeekPlan(OWNER_A)).toBeNull();
  });
});
