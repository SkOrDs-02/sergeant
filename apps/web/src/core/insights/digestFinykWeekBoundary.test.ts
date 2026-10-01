// @vitest-environment jsdom
/**
 * Межа тижня для ГРОШЕЙ у тижневому дайджесті — київська (рішення власника
 * 2026-10-01, `METRICS_VERSION` 17; ADR-0078, `AGENTS.md § Domain invariants`).
 *
 * До цього `aggregateFinyk` різав тиждень за понеділком ПРИСТРОЮ
 * (`deviceMondayStart` + 7×24 год), а Звіти й Аналітика Фініка — за Києвом, тож
 * поза Києвом транзакція біля краю тижня лягала в різні тижні в різних місцях.
 * Тиждень, як і раніше, називає ключ-понеділок пристрою (спільний зі звичками,
 * їжею й тренуваннями); гроші до його семи дат відносить КИЇВСЬКИЙ день.
 *
 * Пояс пристрою перемикається прямо в тесті: Node перечитує `process.env.TZ` на
 * льоту. Моменти задані явним UTC (вересень 2026: Київ = UTC+3).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";

import { aggregateFinyk } from "./useWeeklyDigest";

const ORIGINAL_TZ = process.env["TZ"];

/** Київ — еталон; решта — пристрої на різних боках від нього. */
const DEVICE_TZS = [
  "Europe/Kyiv",
  "UTC",
  "America/New_York", // позаду Києва на 7 год
  "Asia/Tokyo", // попереду на 6 год
] as const;

const sec = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

// Тиждень дайджесту 14–20 вересня 2026 (пн–нд). Київські межі:
// [13.09 21:00Z, 20.09 21:00Z).
const BANK_TXS = [
  // Нд 13.09 23:30 Київ — ПОПЕРЕДНІЙ тиждень. На пристрої в Токіо (вікно
  // «пн 00:00 JST» = 13.09 15:00Z) стара логіка брала її в цей.
  { id: "sun-before", amount: -10_000, time: sec("2026-09-13T20:30:00Z") },
  // Пн 14.09 00:30 Київ — ЦЕЙ тиждень. У Нью-Йорку (вікно «пн 00:00 EDT» =
  // 14.09 04:00Z) стара логіка її губила.
  { id: "mon-early", amount: -20_000, time: sec("2026-09-13T21:30:00Z") },
  // Середина тижня — контроль, у всіх поясах однаково.
  { id: "wed", amount: -160_000, time: sec("2026-09-16T09:00:00Z") },
  // Нд 20.09 23:30 Київ — ЦЕЙ тиждень. У Токіо (кінець вікна = 20.09 15:00Z)
  // стара логіка її губила.
  { id: "sun-late", amount: -40_000, time: sec("2026-09-20T20:30:00Z") },
  // Пн 21.09 00:30 Київ — НАСТУПНИЙ тиждень. У Нью-Йорку (кінець вікна =
  // 21.09 04:00Z) стара логіка брала її в цей.
  { id: "mon-after", amount: -80_000, time: sec("2026-09-20T21:30:00Z") },
  // Дохід на самій межі — теж лише в одному тижні.
  { id: "income-edge", amount: 500_000, time: sec("2026-09-13T21:00:00Z") },
];

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
  __setFinykMonoMirrorCacheForTests({
    transactions: BANK_TXS as never[],
    accounts: [],
    refreshedAt: "2026-09-21T00:00:00.000Z",
  });
  __setFinykSqliteStateCacheForTests({
    txCategories: {},
    hiddenTransactions: [],
    refreshedAt: "2026-09-21T00:00:00.000Z",
  });
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
  else process.env["TZ"] = ORIGINAL_TZ;
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
});

function aggregateOn(tz: string, weekKey: string) {
  process.env["TZ"] = tz;
  return aggregateFinyk(weekKey);
}

describe("aggregateFinyk: тиждень дайджесту ріжеться за київською добою", () => {
  it.each(DEVICE_TZS)(
    "пристрій %s: гроші цього тижня — пн–нд за Києвом, а не 7×24 год від понеділка пристрою",
    (tz) => {
      const out = aggregateOn(tz, "2026-09-14");
      // 200 + 1600 + 400. Нд 13.09 і пн 21.09 — сусідні тижні.
      expect(out.totalSpent).toBe(2200);
      expect(out.totalIncome).toBe(5000); // дохід рівно о 00:00 за Києвом — тут
      expect(out.txCount).toBe(4); // mon-early, wed, sun-late, income-edge
    },
  );

  it.each(DEVICE_TZS)(
    "пристрій %s: кожна транзакція лягає рівно в один тиждень",
    (tz) => {
      const weeks = ["2026-09-07", "2026-09-14", "2026-09-21"].map((k) =>
        aggregateOn(tz, k),
      );
      expect(weeks.map((w) => w.totalSpent)).toEqual([100, 2200, 800]);
      expect(weeks.reduce((s, w) => s + w.totalSpent, 0)).toBe(
        (10_000 + 20_000 + 160_000 + 40_000 + 80_000) / 100,
      );
      expect(weeks.reduce((s, w) => s + w.txCount, 0)).toBe(BANK_TXS.length);
    },
  );

  it("у кого пристрій у Києві, число те саме, що давала межа пристрою (нічого не зрушило)", () => {
    // На київському пристрої `deviceMondayStart` і київський понеділок — та
    // сама мить, тож стара й нова межа збігаються. Зафіксуємо числа до бамп-у
    // `METRICS_VERSION` 17: це і є «жодне число не зрушило для Києва».
    const out = aggregateOn("Europe/Kyiv", "2026-09-14");
    expect(out.totalSpent).toBe(2200);
    expect(out.topCategories.reduce((s, c) => s + c.amount, 0)).toBe(2200);
  });
});
