import {
  addDays,
  aggregateHabits,
  aggregateKcal,
  aggregateSpending,
  aggregateWorkouts,
  datesInRange,
  getPeriodRange,
  localDateKey,
} from "./hubReports.aggregation";

describe("hub reports aggregation helpers", () => {
  it("builds local date keys, date ranges, and period ranges", () => {
    const now = new Date("2026-07-23T12:00:00Z");

    expect(localDateKey(now)).toBe("2026-07-23");
    expect(localDateKey(addDays(now, 2))).toBe("2026-07-25");
    expect(
      datesInRange(new Date("2026-07-20"), new Date("2026-07-22")),
    ).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"]);

    const week = getPeriodRange("week", 0, now);
    expect(localDateKey(week.start)).toBe("2026-07-20");
    expect(localDateKey(week.end)).toBe("2026-07-26");

    const previousWeek = getPeriodRange("week", -1, now);
    expect(localDateKey(previousWeek.start)).toBe("2026-07-13");
    expect(localDateKey(previousWeek.end)).toBe("2026-07-19");

    const month = getPeriodRange("month", 0, now);
    expect(localDateKey(month.start)).toBe("2026-07-01");
    expect(localDateKey(month.end)).toBe("2026-07-31");

    const previousMonth = getPeriodRange("month", -1, now);
    expect(localDateKey(previousMonth.start)).toBe("2026-06-01");
    expect(localDateKey(previousMonth.end)).toBe("2026-06-30");
  });

  it("counts completed workouts from both supported persisted shapes", () => {
    const dates = ["2026-07-20", "2026-07-21", "2026-07-22"];

    expect(
      aggregateWorkouts(
        JSON.stringify([
          {
            startedAt: "2026-07-20T10:00:00Z",
            endedAt: "2026-07-20T11:00:00Z",
          },
          {
            startedAt: new Date("2026-07-21T10:00:00Z").getTime(),
            endedAt: new Date("2026-07-21T11:00:00Z").getTime(),
          },
          {
            startedAt: "2026-07-21T12:00:00Z",
            endedAt: null,
          },
          {
            startedAt: "2026-07-28T10:00:00Z",
            endedAt: "2026-07-28T11:00:00Z",
          },
          {
            startedAt: "not-a-date",
            endedAt: "2026-07-22T11:00:00Z",
          },
        ]),
        dates,
      ),
    ).toEqual({
      count: 2,
      daily: {
        "2026-07-20": 1,
        "2026-07-21": 1,
      },
    });

    expect(
      aggregateWorkouts(
        JSON.stringify({
          workouts: [
            {
              startedAt: "2026-07-22T10:00:00Z",
              endedAt: "2026-07-22T11:00:00Z",
            },
          ],
        }),
        dates,
      ),
    ).toEqual({
      count: 1,
      daily: { "2026-07-22": 1 },
    });
  });

  it("treats absent or malformed workout shards as empty", () => {
    expect(aggregateWorkouts(null, ["2026-07-20"])).toEqual({
      count: 0,
      daily: {},
    });
    expect(aggregateWorkouts("{", ["2026-07-20"])).toEqual({
      count: 0,
      daily: {},
    });
    expect(
      aggregateWorkouts(JSON.stringify({ nope: [] }), ["2026-07-20"]),
    ).toEqual({
      count: 0,
      daily: {},
    });
  });

  it("sums outgoing finyk spending while excluding hidden and transfer ids", () => {
    expect(
      aggregateSpending(
        {
          txList: [
            {
              id: "coffee",
              amount: -5_000,
              time: new Date("2026-07-20T10:00:00Z").getTime(),
            },
            {
              id: "groceries",
              amount: -20_000,
              time: Math.floor(
                new Date("2026-07-21T10:00:00Z").getTime() / 1000,
              ),
            },
            {
              id: "income",
              amount: 50_000,
              time: new Date("2026-07-21T10:00:00Z").getTime(),
            },
            {
              id: "hidden",
              amount: -10_000,
              time: new Date("2026-07-21T10:00:00Z").getTime(),
            },
            {
              id: "outside",
              amount: -99_000,
              time: new Date("2026-07-28T10:00:00Z").getTime(),
            },
          ],
          excludedTxIds: new Set(["hidden"]),
        },
        ["2026-07-20", "2026-07-21"],
      ),
    ).toEqual({
      total: 25_000,
      daily: {
        "2026-07-20": 5_000,
        "2026-07-21": 20_000,
      },
    });
  });

  it("calculates habit completion percentage across active habits", () => {
    expect(
      aggregateHabits(
        {
          habits: [
            { id: "water" },
            { id: "sleep" },
            { id: "archived", archived: true },
          ],
          completions: {
            water: ["2026-07-20", "2026-07-21"],
            sleep: ["2026-07-20"],
            archived: ["2026-07-20", "2026-07-21"],
          },
        },
        ["2026-07-20", "2026-07-21"],
      ),
    ).toEqual({
      pct: 75,
      daily: {
        "2026-07-20": 100,
        "2026-07-21": 50,
      },
    });
  });

  it("returns empty habit aggregates for missing or inactive state", () => {
    expect(aggregateHabits(null, ["2026-07-20"])).toEqual({
      pct: 0,
      daily: {},
    });
    expect(
      aggregateHabits({ habits: [{ id: "archived", archived: true }] }, [
        "2026-07-20",
      ]),
    ).toEqual({
      pct: 0,
      daily: {},
    });
  });

  it("sums and averages kcal over days with meals", () => {
    expect(
      aggregateKcal(
        {
          "2026-07-20": {
            meals: [{ macros: { kcal: 800 } }, { macros: { kcal: 600 } }],
          },
          "2026-07-21": {
            meals: [{ macros: { kcal: 1000 } }, {}],
          },
          "2026-07-22": { meals: [] },
          "2026-07-28": {
            meals: [{ macros: { kcal: 9999 } }],
          },
        },
        ["2026-07-20", "2026-07-21", "2026-07-22"],
      ),
    ).toEqual({
      total: 2400,
      avg: 800,
      daily: {
        "2026-07-20": 1400,
        "2026-07-21": 1000,
        "2026-07-22": 0,
      },
    });
  });

  it("returns zero kcal aggregates for absent logs", () => {
    expect(aggregateKcal(null, ["2026-07-20"])).toEqual({
      total: 0,
      avg: 0,
      daily: {},
    });
  });
});
