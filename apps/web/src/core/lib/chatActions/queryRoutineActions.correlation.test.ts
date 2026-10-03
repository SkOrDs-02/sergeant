// @vitest-environment jsdom
/**
 * Status: Active
 *
 * F-10/F-11 (браузерний QA 2026-08-24). `habit_correlation` читав лише
 * Mono-дзеркало, тож у користувача без банку обидві групи днів мали нуль
 * витрат — і тул упевнено відповідав «0 грн/день проти 0 грн/день, різниця
 * 0%». Модель переказувала це як «звʼязку немає», хоча курований графік на
 * тих самих даних показував r=-0.99.
 *
 * Той самий баг уже ловили у `crossActions/dailySeries.ts` (F7 репетиції
 * бета-прогону 2026-08-07) — цей виконавець лишився зі старим всесвітом.
 * Тест пінить обидві половини фіксу: ручні витрати входять у кореляцію, а
 * порожній всесвіт каже «нема даних», а не «різниці нема».
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { handleQueryRoutineAction } from "./queryRoutineActions";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../modules/routine/lib/sqliteReader";
import { __setFinykSqliteStateCacheForTests } from "../../../modules/finyk/lib/sqliteReader";
import type { ChatAction } from "./types";

const HABIT_ID = "hab-med";

function call(action: ChatAction): string {
  const out = handleQueryRoutineAction(action);
  if (out == null) throw new Error("handler returned nothing");
  return typeof out === "string" ? out : out.result;
}

/** Дні, коли звичка виконана, і ручні витрати на кожен день вікна. */
function seed(opts: {
  doneDays: string[];
  expenses: Array<{ date: string; amount: number }>;
}): void {
  __setRoutineSqliteStateCacheForTests({
    habits: [
      {
        id: HABIT_ID,
        name: "Медитація",
        emoji: "check",
        recurrence: "daily",
      },
    ],
    habitOrder: [HABIT_ID],
  } as never);
  __setRoutineSqliteCompletionsCacheForTests({
    completions: { [HABIT_ID]: opts.doneDays },
  });
  __setFinykSqliteStateCacheForTests({
    manualExpenses: opts.expenses.map((e, i) => ({
      id: `man-${i}`,
      date: `${e.date}T12:00:00.000Z`,
      description: "Кава",
      amount: e.amount,
      category: "cafe",
      kind: "expense",
    })),
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});

afterEach(() => {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  __setFinykSqliteStateCacheForTests({});
  vi.useRealTimers();
});

describe("habit_correlation — всесвіт витрат", () => {
  it("рахує РУЧНІ витрати, а не лише банківські", () => {
    seed({
      doneDays: ["2026-04-21", "2026-04-20"],
      expenses: [
        { date: "2026-04-21", amount: 100 },
        { date: "2026-04-20", amount: 100 },
        { date: "2026-04-19", amount: 900 },
        { date: "2026-04-18", amount: 900 },
      ],
    });

    const out = call({
      name: "habit_correlation",
      input: { habit: "Медитація", against: "spending", period_days: 7 },
    } as ChatAction);

    // Головне: суми НЕ нульові — до фіксу тут було «0 грн/день» в обох групах.
    expect(out).not.toMatch(/Дні зі звичкою \(\d+\): 0 грн\/день/);
    expect(out).toContain("Витрати");
    // Дні зі звичкою дешевші за дні без неї — напрямок звʼязку збережено.
    const withAvg = Number(out.match(/Дні зі звичкою \(\d+\): (\d+)/)?.[1]);
    const withoutAvg = Number(out.match(/Дні без неї \(\d+\): (\d+)/)?.[1]);
    expect(withAvg).toBeGreaterThan(0);
    expect(withAvg).toBeLessThan(withoutAvg);
  });

  it("каже «нема даних» замість «різниці нема», коли витрат немає взагалі", () => {
    seed({ doneDays: ["2026-04-21"], expenses: [] });

    const out = call({
      name: "habit_correlation",
      input: { habit: "Медитація", against: "spending", period_days: 7 },
    } as ChatAction);

    expect(out).toContain("Немає даних про витрати");
    expect(out).not.toContain("Різниця:");
  });
});
