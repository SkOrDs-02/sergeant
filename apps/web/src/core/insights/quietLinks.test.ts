/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import type { DailySeries } from "../lib/chatActions/crossActions/dailySeries";
import type { NotablePair } from "./digestCorrelations";
import { lastActiveDay, quietLinks, recordNotableLinks } from "./quietLinks";

const DAYS = Array.from(
  { length: 20 },
  (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`,
);

function series(kcalUntil: number, workoutsUntil: number): DailySeries {
  return {
    from: DAYS[0]!,
    to: DAYS[DAYS.length - 1]!,
    days: DAYS,
    metrics: ["kcal", "workouts"],
    raw: {
      // `kcal`: відсутність = «не виміряно», тож мовчання це `undefined`.
      kcal: DAYS.map((_, i) => (i < kcalUntil ? 2000 : undefined)),
      // `workouts`: відсутність = справжній нуль, тож мовчання це нулі.
      workouts: DAYS.map((_, i) => (i < workoutsUntil ? 1 : 0)),
    },
  };
}

const PAIR: NotablePair = {
  a: "kcal",
  b: "workouts",
  phrase: "у дні тренувань ти їси більше",
  n: 12,
  pearson: 0.6,
};

describe("F-5: звʼязок, чий модуль замовк", () => {
  beforeEach(() => localStorage.clear());

  it("останній день із записом не рахує структурні нулі записом", () => {
    const s = series(20, 5);
    expect(lastActiveDay(s, "kcal")).toBe("2026-09-20");
    expect(lastActiveDay(s, "workouts")).toBe("2026-09-05");
  });

  it("зниклий звʼязок пояснює, який модуль мовчить і з якого дня", () => {
    const remembered = recordNotableLinks([PAIR], "2026-09-10");
    expect(quietLinks(series(20, 5), [], remembered)).toEqual([
      {
        phrase: PAIR.phrase,
        module: "fizruk",
        since: "2026-09-05",
      },
    ]);
  });

  it("звʼязок, що ослаб при живих обох модулях, не пояснюється мовчанням", () => {
    const remembered = recordNotableLinks([PAIR], "2026-09-10");
    expect(quietLinks(series(20, 20), [], remembered)).toEqual([]);
  });

  it("поки звʼязок помітний, пояснення немає", () => {
    const remembered = recordNotableLinks([PAIR], "2026-09-20");
    expect(quietLinks(series(20, 5), [PAIR], remembered)).toEqual([]);
  });

  it("пара з метрикою, якої нема в рядах, не пояснюється", () => {
    const remembered = recordNotableLinks(
      [{ ...PAIR, b: "retired_metric" as never }],
      "2026-09-10",
    );
    expect(quietLinks(series(20, 5), [], remembered)).toEqual([]);
  });

  it("звʼязок, бачений раніше за вікно аналізу, забувається", () => {
    recordNotableLinks([PAIR], "2026-06-01");
    expect(recordNotableLinks([], "2026-09-20")).toEqual({});
  });
});
