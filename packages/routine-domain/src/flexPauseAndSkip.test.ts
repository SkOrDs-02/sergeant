import { describe, expect, it } from "vitest";

import {
  applyClearHabitSkip,
  applyPauseHabitBetween,
  applyResumeHabitFrom,
  applySetHabitSkip,
  applyToggleHabitCompletion,
} from "./reducers.js";
import { dateKeyInPauseInterval, habitScheduledOnDate } from "./schedule.js";
import {
  defaultRoutineState,
  normalizePauseIntervals,
  normalizeRoutineState,
  normalizeSkipsMap,
} from "./storage.js";
import { completionRateForRange } from "./streaks.js";
import type { Habit, RoutineState } from "./types.js";

function stateWith(habit: Partial<Habit> = {}): RoutineState {
  return {
    ...defaultRoutineState(),
    habits: [
      {
        id: "h1",
        name: "Зарядка",
        recurrence: "daily",
        startDate: "2026-01-01",
        ...habit,
      },
    ],
  };
}

describe("dateKeyInPauseInterval", () => {
  it("межі інтервалу включні", () => {
    const iv = [{ from: "2026-07-10", to: "2026-07-12" }];
    expect(dateKeyInPauseInterval(iv, "2026-07-09")).toBe(false);
    expect(dateKeyInPauseInterval(iv, "2026-07-10")).toBe(true);
    expect(dateKeyInPauseInterval(iv, "2026-07-12")).toBe(true);
    expect(dateKeyInPauseInterval(iv, "2026-07-13")).toBe(false);
  });

  it("відкритий інтервал діє нескінченно вперед", () => {
    const iv = [{ from: "2026-07-10", to: null }];
    expect(dateKeyInPauseInterval(iv, "2026-07-09")).toBe(false);
    expect(dateKeyInPauseInterval(iv, "2030-01-01")).toBe(true);
  });
});

describe("habitScheduledOnDate + інтервали", () => {
  it("день усередині інтервалу не запланований, поза ним — запланований", () => {
    const h: Habit = {
      id: "h1",
      name: "x",
      recurrence: "daily",
      startDate: "2026-01-01",
      pauseIntervals: [{ from: "2026-07-10", to: "2026-07-12" }],
    };
    expect(habitScheduledOnDate(h, "2026-07-11")).toBe(false);
    expect(habitScheduledOnDate(h, "2026-07-13")).toBe(true);
    // Головна відмінність від легасі-прапора: минуле ДО паузи не переписане.
    expect(habitScheduledOnDate(h, "2026-06-01")).toBe(true);
  });
});

describe("normalizePauseIntervals", () => {
  it("відкидає биті межі й неправильний порядок", () => {
    expect(
      normalizePauseIntervals([
        { from: "not-a-date", to: null },
        { from: "2026-07-10", to: "2026-07-01" },
        { from: "2026-07-10", to: "2026-07-12" },
        null,
        "nope",
      ]),
    ).toEqual([{ from: "2026-07-10", to: "2026-07-12" }]);
  });

  it("зливає перекриття й суміжні інтервали", () => {
    expect(
      normalizePauseIntervals([
        { from: "2026-07-10", to: "2026-07-12" },
        { from: "2026-07-11", to: "2026-07-20" },
      ]),
    ).toEqual([{ from: "2026-07-10", to: "2026-07-20" }]);
  });

  it("відкритий інтервал поглинає все, що після нього", () => {
    expect(
      normalizePauseIntervals([
        { from: "2026-07-10", to: null },
        { from: "2026-08-01", to: "2026-08-05" },
      ]),
    ).toEqual([{ from: "2026-07-10", to: null }]);
  });
});

describe("normalizeSkipsMap", () => {
  it("невідома причина зводиться до `other`, нотатка тримається", () => {
    const out = normalizeSkipsMap({
      h1: {
        "2026-07-10": { reason: "щось нове", at: "2026-07-10T08:00:00.000Z" },
        "2026-07-11": {
          reason: "sick",
          note: "  температура  ",
          at: "2026-07-11T08:00:00.000Z",
        },
        "не-дата": { reason: "sick", at: "x" },
      },
    });
    expect(out["h1"]?.["2026-07-10"]?.reason).toBe("other");
    expect(out["h1"]?.["2026-07-11"]?.note).toBe("температура");
    expect(out["h1"]?.["не-дата"]).toBeUndefined();
  });

  it("порожні мапи не осідають у стані", () => {
    expect(normalizeSkipsMap({ h1: {}, h2: "сміття" })).toEqual({});
  });

  it("стара форма стану читається без міграції", () => {
    const legacy = normalizeRoutineState({ habits: [], completions: {} });
    expect(legacy.skips).toEqual({});
  });
});

describe("applySetHabitSkip / applyClearHabitSkip", () => {
  it("ставить пропуск і знімає відмітку виконання", () => {
    let s = stateWith();
    s = applyToggleHabitCompletion(s, "h1", "2026-07-10");
    expect(s.completions["h1"]).toEqual(["2026-07-10"]);

    s = applySetHabitSkip(s, "h1", "2026-07-10", "sick", "застуда");
    expect(s.completions["h1"]).toEqual([]);
    expect(s.skips?.["h1"]?.["2026-07-10"]?.reason).toBe("sick");
    expect(s.skips?.["h1"]?.["2026-07-10"]?.note).toBe("застуда");
  });

  it("відмітка виконання знімає пропуск — три стани взаємно виключні", () => {
    let s = stateWith();
    s = applySetHabitSkip(s, "h1", "2026-07-10", "busy");
    s = applyToggleHabitCompletion(s, "h1", "2026-07-10");
    expect(s.completions["h1"]).toEqual(["2026-07-10"]);
    expect(s.skips?.["h1"]).toBeUndefined();
  });

  it("no-op для дня, який звичці не запланований", () => {
    const s = stateWith({ recurrence: "weekly", weekdays: [0] }); // лише Пн
    const next = applySetHabitSkip(s, "h1", "2026-07-12", "rest"); // неділя
    expect(next).toBe(s);
  });

  it("зняття пропуску повертає день у стан «не зробив»", () => {
    let s = stateWith();
    s = applySetHabitSkip(s, "h1", "2026-07-10", "travel");
    s = applyClearHabitSkip(s, "h1", "2026-07-10");
    expect(s.skips?.["h1"]).toBeUndefined();
  });

  it("нотатка обрізається до 200 символів", () => {
    const s = applySetHabitSkip(
      stateWith(),
      "h1",
      "2026-07-10",
      "other",
      "я".repeat(500),
    );
    expect(s.skips?.["h1"]?.["2026-07-10"]?.note).toHaveLength(200);
  });
});

describe("applyPauseHabitBetween / applyResumeHabitFrom", () => {
  it("заявляє датовану паузу й ідемпотентна на повторі", () => {
    let s = stateWith();
    s = applyPauseHabitBetween(s, "h1", "2026-07-10", "2026-07-20");
    const once = s.habits[0]?.pauseIntervals;
    s = applyPauseHabitBetween(s, "h1", "2026-07-10", "2026-07-20");
    expect(s.habits[0]?.pauseIntervals).toEqual(once);
    expect(once).toEqual([{ from: "2026-07-10", to: "2026-07-20" }]);
  });

  it("не вмикає легасі-прапор `paused`", () => {
    const s = applyPauseHabitBetween(stateWith(), "h1", "2026-07-10", null);
    expect(s.habits[0]?.paused).toBeUndefined();
  });

  it("дострокове повернення закриває інтервал учорашнім днем, а не стирає його", () => {
    let s = stateWith();
    s = applyPauseHabitBetween(s, "h1", "2026-07-10", null);
    s = applyResumeHabitFrom(s, "h1", "2026-07-15");
    expect(s.habits[0]?.pauseIntervals).toEqual([
      { from: "2026-07-10", to: "2026-07-14" },
    ]);
  });

  it("пауза, яка ще не почалась, прибирається цілком", () => {
    let s = stateWith();
    s = applyPauseHabitBetween(s, "h1", "2026-07-20", "2026-07-25");
    s = applyResumeHabitFrom(s, "h1", "2026-07-20");
    expect(s.habits[0]?.pauseIntervals).toEqual([]);
  });

  it("перевернутий діапазон — no-op", () => {
    const s = stateWith();
    expect(applyPauseHabitBetween(s, "h1", "2026-07-20", "2026-07-10")).toBe(s);
  });
});

describe("completionRateForRange із пропусками", () => {
  const habits: Habit[] = [
    { id: "h1", name: "x", recurrence: "daily", startDate: "2026-07-01" },
  ];

  it("«не зміг» виходить зі знаменника, а не рахується провалом", () => {
    const completions = { h1: ["2026-07-01", "2026-07-02"] };
    const base = completionRateForRange(
      habits,
      completions,
      "2026-07-01",
      "2026-07-04",
    );
    expect(base).toEqual({ completed: 2, scheduled: 4, rate: 0.5 });

    const withSkips = completionRateForRange(
      habits,
      completions,
      "2026-07-01",
      "2026-07-04",
      {
        skips: {
          h1: {
            "2026-07-03": { reason: "sick", at: "2026-07-03T08:00:00.000Z" },
            "2026-07-04": { reason: "sick", at: "2026-07-04T08:00:00.000Z" },
          },
        },
      },
    );
    expect(withSkips).toEqual({ completed: 2, scheduled: 2, rate: 1 });
  });

  it("день паузи вже виключений розкладом і без опції пропусків", () => {
    const paused: Habit[] = [
      {
        ...habits[0]!,
        pauseIntervals: [{ from: "2026-07-03", to: "2026-07-04" }],
      },
    ];
    expect(
      completionRateForRange(
        paused,
        { h1: ["2026-07-01", "2026-07-02"] },
        "2026-07-01",
        "2026-07-04",
      ),
    ).toEqual({ completed: 2, scheduled: 2, rate: 1 });
  });
});
