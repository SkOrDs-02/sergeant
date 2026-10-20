import { describe, expect, it, vi } from "vitest";
import { deviceDayKey, toKyivISODate } from "@sergeant/shared";

import {
  dateKeyDaysAgo,
  parseScenarioLocalWorld,
  resolveFizrukWorkout,
  resolveRoutineHabit,
  waitUntil,
} from "./world";

describe("parseScenarioLocalWorld", () => {
  it("приймає мінімальний світ і дає порожні списки", () => {
    const world = parseScenarioLocalWorld({ scenario: "empty" });
    expect(world.pantryItems).toEqual([]);
    expect(world.fizrukWorkouts).toEqual([]);
  });

  it("відхиляє невідоме поле", () => {
    expect(() =>
      parseScenarioLocalWorld({ scenario: "empty", extra: 1 }),
    ).toThrow(/невідоме поле 'extra'/);
  });

  it("відхиляє null замість обʼєкта в колекції", () => {
    expect(() =>
      parseScenarioLocalWorld({ scenario: "empty", pantryItems: [null] }),
    ).toThrow(/pantryItems\[0\]: очікував обʼєкт/);
  });

  it("відхиляє невідомий id світу", () => {
    expect(() => parseScenarioLocalWorld({ scenario: "v2-world" })).toThrow(
      /невідомий id/,
    );
  });

  it("парсить журнал Їжі й норму", () => {
    const world = parseScenarioLocalWorld({
      scenario: "nutrition-day",
      nutritionGoal: { kcal: 1900, protein_g: 120, fat_g: 60, carbs_g: 230 },
      nutritionMeals: [
        {
          daysAgo: 0,
          time: "08:10",
          mealType: "breakfast",
          name: "Вівсянка",
          amount_g: null,
          kcal: 412,
          protein_g: 12,
          fat_g: 8,
          carbs_g: 70,
        },
      ],
    });
    expect(world.nutritionGoal?.kcal).toBe(1900);
    expect(world.nutritionMeals[0]?.amount_g).toBeNull();
  });

  it("відхиляє невідомий тип прийому їжі", () => {
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "nutrition-day",
        nutritionMeals: [
          {
            daysAgo: 0,
            time: "08:10",
            mealType: "brunch",
            name: "Вівсянка",
            amount_g: null,
            kcal: 1,
            protein_g: 0,
            fat_g: 0,
            carbs_g: 0,
          },
        ],
      }),
    ).toThrow(/mealType/);
  });

  it("відхиляє відʼємний daysAgo", () => {
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "fizruk-active-session",
        fizrukWorkouts: [{ id: "w", daysAgo: -1, items: [] }],
      }),
    ).toThrow(/daysAgo/);
  });

  it("rejects malformed collections, missing strings and fractional values", () => {
    expect(() =>
      parseScenarioLocalWorld({ scenario: "empty", pantryItems: {} }),
    ).toThrow(/очікував масив/);
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "empty",
        pantryItems: [{ name: "  ", qty: null, unit: null }],
      }),
    ).toThrow(/очікував непорожній рядок/);
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "empty",
        finykBudgets: [{ id: "b", categoryId: "food", limit: -1 }],
      }),
    ).toThrow(/число >= 0/);
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "empty",
        fizrukWorkouts: [
          {
            id: "w",
            daysAgo: 0,
            items: [
              {
                id: "i",
                exerciseId: "e",
                nameUk: "Тяга",
                primaryGroup: "back",
                sets: [{ weightKg: -1, reps: 3 }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/число >= 0/);
  });

  it("allows only one active workout and accepts a complete local world", () => {
    const workout = { id: "w", daysAgo: 0, active: true, items: [] };
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "fizruk-active-session",
        fizrukWorkouts: [workout, { ...workout, id: "w2" }],
      }),
    ).toThrow(/активна сесія лише одна/);
    const world = parseScenarioLocalWorld({
      scenario: "fizruk-active-session",
      pantryItems: [{ name: "Рис", qty: 2, unit: "кг" }],
      routineHabits: [
        { id: "h", name: "Вода", streakDays: 2, missedYesterday: true },
      ],
      finykBudgets: [{ id: "b", categoryId: "food", limit: 3000 }],
      fizrukWorkouts: [workout],
      nutritionGoal: { kcal: 1800, protein_g: 100, fat_g: 60, carbs_g: 200 },
    });
    expect(world).toMatchObject({
      pantryItems: [{ qty: 2 }],
      finykBudgets: [{ limit: 3000 }],
      nutritionGoal: { kcal: 1800 },
    });
  });
});

describe("дати світу", () => {
  it("daysAgo 0 це сьогоднішній device-local ключ", () => {
    expect(dateKeyDaysAgo(0)).toBe(deviceDayKey(new Date()));
  });

  it("ключ дня береться з годинника пристрою, а не з Києва (ADR-0078)", () => {
    // 22:30 UTC: на пристрої (TZ=UTC у vitest.config.js) ще 2026-06-23, а в
    // Києві (UTC+3 влітку) уже 01:30 наступної доби. CI-лейни теж їдуть у UTC.
    const now = new Date("2026-06-23T22:30:00Z");
    expect(toKyivISODate(now)).toBe("2026-06-24");
    expect(dateKeyDaysAgo(0, now)).toBe("2026-06-23");
    expect(dateKeyDaysAgo(1, now)).toBe("2026-06-22");
  });

  it("стрік N дає N відміток, що закінчуються сьогодні", () => {
    const now = new Date(2026, 8, 29, 12);
    const habit = resolveRoutineHabit(
      { id: "h", name: "Вода", streakDays: 7, missedYesterday: false },
      now,
    );
    expect(habit.dateKeys).toHaveLength(7);
    expect(habit.dateKeys[0]).toBe("2026-09-29");
    expect(habit.startDate).toBe("2026-09-22");
  });

  it("стрік на межі київської доби лишається в добі пристрою", () => {
    const now = new Date("2026-06-23T22:30:00Z");
    const habit = resolveRoutineHabit(
      { id: "h", name: "Вода", streakDays: 1, missedYesterday: true },
      now,
    );
    expect(habit.dateKeys).toEqual(["2026-06-23"]);
    expect(habit.startDate).toBe("2026-06-16");
    expect(habit.missedDateKey).toBe("2026-06-22");
  });

  it("rejects negative daysAgo and resolves completed workouts consistently", () => {
    expect(() => dateKeyDaysAgo(-1)).toThrow(/цілим числом >= 0/);
    const resolved = resolveFizrukWorkout(
      { id: "done", daysAgo: 2, active: false, items: [] },
      new Date("2026-09-29T12:00:00Z"),
    );
    expect(resolved.startedAt).toBe("2026-09-27T10:00:00.000Z");
    expect(resolved.endedAt).toBe("2026-09-27T11:00:00.000Z");
  });

  it("waitUntil resolves immediately and reports the failed step on timeout", async () => {
    await expect(waitUntil("ready", () => true)).resolves.toBeUndefined();
    vi.useFakeTimers();
    const pending = waitUntil("routine", () => false, 0);
    const rejection = expect(pending).rejects.toThrow(/крок 'routine'/);
    await vi.advanceTimersByTimeAsync(51);
    await rejection;
    vi.useRealTimers();
  });
});
