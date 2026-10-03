import { describe, expect, it } from "vitest";

import { calcFizrukPeriodAggregate } from "./periodAggregate.js";

const MONDAY = Date.parse("2026-05-04T00:00:00.000Z");
const DAY = 86_400_000;
const WEEK_END = MONDAY + 7 * DAY;

const workouts = [
  {
    id: "w1",
    startedAt: "2026-05-04T18:00:00.000Z",
    endedAt: "2026-05-04T19:00:00.000Z",
    items: [
      {
        nameUk: "Присідання",
        type: "strength",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 100, reps: 5 },
        ],
      },
      {
        nameUk: "Біг",
        type: "distance",
        sets: [{ weightKg: 0, reps: 0 }],
      },
    ],
  },
  {
    id: "w2",
    startedAt: "2026-05-06T18:00:00.000Z",
    endedAt: "2026-05-06T19:00:00.000Z",
    items: [
      {
        nameUk: "Присідання",
        type: "strength",
        sets: [{ weightKg: 80, reps: 10 }],
      },
    ],
  },
  {
    id: "w3-unfinished",
    startedAt: "2026-05-07T18:00:00.000Z",
    endedAt: null,
    items: [
      { nameUk: "Жим", type: "strength", sets: [{ weightKg: 60, reps: 10 }] },
    ],
  },
  {
    id: "w4-next-week",
    startedAt: "2026-05-12T18:00:00.000Z",
    endedAt: "2026-05-12T19:00:00.000Z",
    items: [
      { nameUk: "Жим", type: "strength", sets: [{ weightKg: 60, reps: 10 }] },
    ],
  },
];

describe("calcFizrukPeriodAggregate", () => {
  it("рахує кількість тренувань і обʼєм у вікні [start, end)", () => {
    const out = calcFizrukPeriodAggregate(workouts, {
      start: MONDAY,
      end: WEEK_END,
    });
    // w1: 100×5 + 100×5 = 1000; w2: 80×10 = 800.
    expect(out.workoutsCount).toBe(2);
    expect(out.totalVolumeKg).toBe(1800);
    expect(out.byExercise).toEqual({ Присідання: 1800 });
  });

  it("незавершене тренування не входить (requireEnded за замовчуванням)", () => {
    const withUnfinished = calcFizrukPeriodAggregate(workouts, {
      start: MONDAY,
      end: WEEK_END,
      requireEnded: false,
    });
    expect(withUnfinished.workoutsCount).toBe(3);
    expect(withUnfinished.totalVolumeKg).toBe(2400);
  });

  it("тренування наступного тижня відрізане верхньою межею", () => {
    const nextWeek = calcFizrukPeriodAggregate(workouts, {
      start: WEEK_END,
      end: WEEK_END + 7 * DAY,
    });
    expect(nextWeek.workoutsCount).toBe(1);
    expect(nextWeek.byExercise).toEqual({ Жим: 600 });
  });

  it("strengthOnly відсікає не-силові типи (розбіжність із дайджестом)", () => {
    const cardioHeavy = [
      {
        id: "c1",
        startedAt: "2026-05-05T10:00:00.000Z",
        endedAt: "2026-05-05T11:00:00.000Z",
        items: [
          {
            nameUk: "Гребля",
            type: "distance",
            sets: [{ weightKg: 5, reps: 100 }],
          },
          {
            nameUk: "Тяга",
            type: "strength",
            sets: [{ weightKg: 50, reps: 10 }],
          },
        ],
      },
    ];
    const all = calcFizrukPeriodAggregate(cardioHeavy, {
      start: MONDAY,
      end: WEEK_END,
    });
    const strength = calcFizrukPeriodAggregate(cardioHeavy, {
      start: MONDAY,
      end: WEEK_END,
      strengthOnly: true,
    });
    expect(all.totalVolumeKg).toBe(1000);
    expect(strength.totalVolumeKg).toBe(500);
  });

  it("толерує порожній/битий вхід без кидання", () => {
    expect(calcFizrukPeriodAggregate(null, { start: 0 })).toEqual({
      workoutsCount: 0,
      totalVolumeKg: 0,
      byExercise: {},
    });
    expect(
      calcFizrukPeriodAggregate(
        [{ id: "x", startedAt: "не-дата", endedAt: "2026-05-04", items: [] }],
        { start: MONDAY, end: WEEK_END },
      ).workoutsCount,
    ).toBe(0);
  });

  it("вправа без nameUk не ламає розріз, але входить у сумарний обʼєм", () => {
    const out = calcFizrukPeriodAggregate(
      [
        {
          id: "n1",
          startedAt: "2026-05-05T10:00:00.000Z",
          endedAt: "2026-05-05T11:00:00.000Z",
          items: [{ type: "strength", sets: [{ weightKg: 20, reps: 10 }] }],
        },
      ],
      { start: MONDAY, end: WEEK_END },
    );
    expect(out.totalVolumeKg).toBe(200);
    expect(out.byExercise).toEqual({});
  });
});
