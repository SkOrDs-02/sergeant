// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  REQUIRED_CONSECUTIVE_CHECKS,
  consecutiveChecks,
  pairHistoryKey,
  readLinkCheckHistory,
  recordAndCountChecks,
  recordWeeklyChecks,
} from "./crossModuleLinkHistory";
import {
  gradeCrossModuleLink,
  STABLE_N,
  STRONG_R,
} from "./crossModuleLinkTiers";

const KEY = STORAGE_KEYS.CROSS_MODULE_LINK_HISTORY;

// Понеділки поспіль: тижневий ключ - це дата понеділка.
const WEEK_1 = new Date("2026-09-07T10:00:00").getTime();
const WEEK_2 = new Date("2026-09-14T10:00:00").getTime();
const WEEK_3 = new Date("2026-09-21T10:00:00").getTime();
// Середина того ж тижня, що й WEEK_3 - для перевірки ідемпотентності.
const WEEK_3_LATER = new Date("2026-09-24T18:00:00").getTime();

const PAIR = { a: "spending", b: "workout_volume" } as const;

describe("crossModuleLinkHistory", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("порожня історія означає нуль перевірок, а не помилку", () => {
    expect(readLinkCheckHistory()).toEqual({});
    expect(consecutiveChecks({}, PAIR.a, PAIR.b, WEEK_1)).toBe(0);
  });

  it("рахує тижні поспіль", () => {
    recordWeeklyChecks([PAIR], WEEK_1);
    const afterTwo = recordWeeklyChecks([PAIR], WEEK_2);
    expect(consecutiveChecks(afterTwo, PAIR.a, PAIR.b, WEEK_2)).toBe(2);

    const afterThree = recordWeeklyChecks([PAIR], WEEK_3);
    expect(consecutiveChecks(afterThree, PAIR.a, PAIR.b, WEEK_3)).toBe(3);
  });

  it("пропущений тиждень скидає лічильник", () => {
    recordWeeklyChecks([PAIR], WEEK_1);
    const history = recordWeeklyChecks([PAIR], WEEK_3);
    expect(consecutiveChecks(history, PAIR.a, PAIR.b, WEEK_3)).toBe(1);
  });

  it("тиждень без перевірки обриває серію вже цього тижня", () => {
    recordWeeklyChecks([PAIR], WEEK_1);
    const history = recordWeeklyChecks([PAIR], WEEK_2);
    expect(consecutiveChecks(history, PAIR.a, PAIR.b, WEEK_3)).toBe(0);
  });

  it("повторний виклик у межах тижня нічого не додає", () => {
    recordWeeklyChecks([PAIR], WEEK_3);
    const history = recordWeeklyChecks([PAIR], WEEK_3_LATER);
    expect(history[pairHistoryKey(PAIR.a, PAIR.b)]).toHaveLength(1);
    expect(consecutiveChecks(history, PAIR.a, PAIR.b, WEEK_3_LATER)).toBe(1);
  });

  it("ключ пари не залежить від порядку метрик", () => {
    recordWeeklyChecks([PAIR], WEEK_1);
    const history = recordWeeklyChecks([{ a: PAIR.b, b: PAIR.a }], WEEK_2);
    expect(consecutiveChecks(history, PAIR.b, PAIR.a, WEEK_2)).toBe(2);
  });

  it("зіпсоване сховище деградує до першого ступеня, а не падає", () => {
    localStorage.setItem(KEY, '{"spending|workout_volume": "не масив"}');
    expect(readLinkCheckHistory()).toEqual({});

    const counts = recordAndCountChecks([PAIR], WEEK_1);
    const checks = counts.get(pairHistoryKey(PAIR.a, PAIR.b)) ?? 0;
    expect(checks).toBe(1);
    expect(gradeCrossModuleLink(STABLE_N, STRONG_R, checks)).toBe(1);
  });

  it("recordAndCountChecks віддає серію одразу, без окремого проходу", () => {
    recordWeeklyChecks([PAIR], WEEK_2);
    const counts = recordAndCountChecks([PAIR], WEEK_3);
    expect(counts.get(pairHistoryKey(PAIR.a, PAIR.b))).toBe(
      REQUIRED_CONSECUTIVE_CHECKS,
    );
  });

  it("перший тиждень тримає пару на першому ступені, другий її піднімає", () => {
    const key = pairHistoryKey(PAIR.a, PAIR.b);

    const week1 = recordAndCountChecks([PAIR], WEEK_1);
    expect(gradeCrossModuleLink(STABLE_N, STRONG_R, week1.get(key))).toBe(1);

    const week2 = recordAndCountChecks([PAIR], WEEK_2);
    expect(gradeCrossModuleLink(STABLE_N, STRONG_R, week2.get(key))).toBe(3);
  });
});
