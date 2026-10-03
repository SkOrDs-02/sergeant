// @vitest-environment jsdom
/**
 * Межа доби в рядах «Звʼязків» (`buildDailySeries`; рішення власника
 * 2026-10-01, f6, ADR-0078): гроші ріжуться за Києвом, решта (тренування,
 * вага, самопочуття, звички, їжа) – за годинником телефона. До цього весь ряд
 * різав дні за Києвом, і запис, зроблений біля опівночі за телефоном, лягав
 * поруч із чужою добою та розходився з ключами звичок і їжі, які пишуться за
 * годинником пристрою.
 *
 * Годинник пристрою тут – UTC (`vitest.config.js` пінить `TZ: "UTC"`
 * навмисно). Момент 21:30 UTC: за телефоном ще 16 вересня, за Києвом
 * (UTC+3 влітку) уже 17-те.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
  type CachedDailyLogEntry,
} from "../../../../modules/fizruk/lib/sqliteReader";
import { buildDailySeries, getDailySeries } from "./dailySeries";
import { buildCrossModuleSeries } from "../../../insights/digestCorrelations";

const INSTANT = "2026-09-16T21:30:00Z";

function journal(
  rows: Array<Partial<CachedDailyLogEntry> & { at: string }>,
): CachedDailyLogEntry[] {
  return rows.map((row, i) => ({
    id: row.id ?? `dl_seed_${i}`,
    weightKg: null,
    sleepHours: null,
    energyLevel: null,
    moodScore: null,
    note: "",
    ...row,
  }));
}

async function seedSpendingAt(iso: string, uah: number): Promise<void> {
  const { __setFinykMonoMirrorCacheForTests } =
    await import("../../../../modules/finyk/lib/monoMirrorReader");
  __setFinykMonoMirrorCacheForTests({
    transactions: [
      {
        id: "late",
        amount: -uah * 100,
        time: Math.floor(Date.parse(iso) / 1000),
      },
    ] as never[],
  });
}

describe("ряди «Звʼязків»: гроші за Києвом, решта за телефоном", () => {
  beforeEach(async () => {
    localStorage.clear();
    clearFizrukSqliteCache();
    const { clearFinykMonoMirrorCache } =
      await import("../../../../modules/finyk/lib/monoMirrorReader");
    clearFinykMonoMirrorCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(INSTANT));
  });
  afterEach(async () => {
    localStorage.clear();
    clearFizrukSqliteCache();
    const { clearFinykMonoMirrorCache } =
      await import("../../../../modules/finyk/lib/monoMirrorReader");
    clearFinykMonoMirrorCache();
    vi.useRealTimers();
  });

  it("витрата о 00:30 за Києвом лягає на київський день", async () => {
    await seedSpendingAt(INSTANT, 300);
    const s = buildDailySeries(["spending"], {
      from: "2026-09-15",
      to: "2026-09-17",
    });
    expect(s.raw["spending"]).toEqual([undefined, undefined, 300]);
  });

  it("тренування того самого моменту лягає на день телефона", () => {
    const startedAt = INSTANT;
    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w1",
          startedAt,
          endedAt: "2026-09-16T22:30:00Z",
          items: [],
        },
      ] as never[],
      refreshedAt: INSTANT,
    } as Parameters<typeof __setFizrukSqliteCacheForTests>[0]);
    const s = buildDailySeries(["workouts"], {
      from: "2026-09-15",
      to: "2026-09-17",
    });
    // 16-те (телефон), а не 17-те (Київ). Після першого запису день без
    // тренування – структурний нуль (`ABSENCE_MEANS`), а не пропуск.
    expect(s.raw["workouts"]).toEqual([undefined, 1, 0]);
  });

  it("вага й самопочуття того самого моменту теж за телефоном", () => {
    __setFizrukSqliteCacheForTests({
      dailyLog: journal([{ at: INSTANT, weightKg: 80, moodScore: 4 }]),
      refreshedAt: INSTANT,
    } as Parameters<typeof __setFizrukSqliteCacheForTests>[0]);
    const s = buildDailySeries(["weight", "wellbeing"], {
      from: "2026-09-15",
      to: "2026-09-17",
    });
    expect(s.raw["weight"]).toEqual([undefined, 80, undefined]);
    expect(s.raw["wellbeing"]).toEqual([undefined, 4, undefined]);
  });

  it("вікно без явних дат закінчується сьогодні за телефоном, а не за Києвом", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending"],
        period_days: 3,
      } as import("../types").GetDailySeriesAction["input"] & {
        period_days?: number;
      },
    });
    // Телефон: 14–16 вересня. Київська доба (17-те) на осі не зʼявляється.
    expect(out).toContain("2026-09-14");
    expect(out).toContain("2026-09-16");
    expect(out).not.toContain("2026-09-17");
  });

  it("вікно кореляцій дайджесту й «Звʼязків» теж закінчується добою телефона", () => {
    const s = buildCrossModuleSeries();
    expect(s.to).toBe("2026-09-16");
  });
});
