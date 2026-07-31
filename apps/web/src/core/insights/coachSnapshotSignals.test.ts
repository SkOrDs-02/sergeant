import { describe, it, expect } from "vitest";

import { coachSnapshotSignals, type CoachSnapshot } from "./useCoachInsight";

/**
 * Поріг публікації текстових інсайтів — канон hub-coach §6.2
 * («краще мовчати, ніж шуміти») + аудит § G2.
 *
 * До цього гейта поріг існував ЛИШЕ для статистичних кореляцій, які рахує
 * код, — а текстовий інсайт, який пише модель, генерувався з будь-якого
 * набору даних, включно з повністю порожнім. Тобто захищено було
 * найнадійнішу частину і не захищено найризикованішу.
 */
const EMPTY: CoachSnapshot = {
  dateContext: {
    todayKey: "2026-07-31",
    weekDayUk: "пʼятниця",
    dayOfWeekIso: 5,
    daysIntoWeek: 5,
    weekRange: "27 лип — 2 сер",
  },
  finyk: { totalSpent: 0, totalIncome: 0, txCount: 0, topCategories: [] },
  fizruk: null,
  nutrition: null,
  routine: null,
};

describe("coachSnapshotSignals", () => {
  it("порожній тиждень — нуль сигналів (модель не будимо)", () => {
    expect(coachSnapshotSignals(EMPTY)).toBe(0);
  });

  it("finyk рахується за txCount, а не за наявністю обʼєкта", () => {
    // `finyk` у снапшоті НЕ nullable: він приходить із нулями навіть тоді,
    // коли транзакцій немає. Перевірка «поле не null» дала б хибний сигнал
    // кожному користувачу без жодної транзакції.
    expect(coachSnapshotSignals(EMPTY)).toBe(0);
    expect(
      coachSnapshotSignals({
        ...EMPTY,
        finyk: { ...EMPTY.finyk, txCount: 3 },
      }),
    ).toBe(1);
  });

  it("fizruk із теплим кешем, але без тренувань, сигналом не є", () => {
    // Обʼєкт матеріалізується за самим фактом кешу — рахуємо `workoutsCount`.
    expect(
      coachSnapshotSignals({
        ...EMPTY,
        fizruk: { workoutsCount: 0, totalVolume: 0, recoveryLabel: "" },
      }),
    ).toBe(0);
  });

  it("nutrition рахується за днями із записами", () => {
    expect(
      coachSnapshotSignals({
        ...EMPTY,
        nutrition: {
          avgKcal: 1900,
          avgProtein: 90,
          targetKcal: 2000,
          daysLogged: 2,
        },
      }),
    ).toBe(1);
  });

  it("кілька модулів із даними складаються", () => {
    expect(
      coachSnapshotSignals({
        ...EMPTY,
        finyk: { ...EMPTY.finyk, txCount: 5 },
        fizruk: { workoutsCount: 2, totalVolume: 1800, recoveryLabel: "" },
        nutrition: {
          avgKcal: 1900,
          avgProtein: 90,
          targetKcal: 2000,
          daysLogged: 4,
        },
        routine: { habitCount: 3, overallRate: 71 },
      }),
    ).toBe(4);
  });
});
