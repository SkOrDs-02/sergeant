import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import {
  groupByDayKey,
  loadPerDayKey,
  loadUserClocks,
  userClockFromRow,
} from "./userClock.js";

/** 2026-12-01 12:00Z: 07:00 у Нью-Йорку (EST), 14:00 у Києві. */
const NOW = new Date("2026-12-01T12:00:00Z");

function poolWith(rows: Record<string, unknown>[]) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
    rows,
    rowCount: rows.length,
  }));
  return { pool: { query } as unknown as Pool, query };
}

describe("userClockFromRow", () => {
  it("без рядка налаштувань: Київ, стеля 2, тихі години 22:00-08:00", () => {
    expect(userClockFromRow(undefined, NOW, null)).toEqual({
      timeZone: "Europe/Kyiv",
      dayKey: "2026-12-01",
      hm: "14:00",
      fromHm: "13:59",
      cap: 2,
      quiet: { startMin: 1320, endMin: 480 },
    });
  });

  it("пояс людини дає її добу й хвилину", () => {
    const clock = userClockFromRow(
      {
        user_id: "u1",
        push_daily_cap: 3,
        time_zone: "America/New_York",
        quiet_hours_enabled: true,
        quiet_hours_start_min: 23 * 60,
        quiet_hours_end_min: 7 * 60,
      },
      NOW,
      null,
    );
    expect(clock).toMatchObject({
      timeZone: "America/New_York",
      dayKey: "2026-12-01",
      hm: "07:00",
      cap: 3,
      quiet: { startMin: 1380, endMin: 420 },
    });
  });

  it("вимкнені тихі години дають `quiet: null`, межі не губляться в БД", () => {
    expect(
      userClockFromRow({ user_id: "u1", quiet_hours_enabled: false }, NOW, null)
        .quiet,
    ).toBeNull();
  });

  it("зіпсований пояс читається як Київ, а не валить прохід", () => {
    expect(
      userClockFromRow({ user_id: "u1", time_zone: "Mars/Olympus" }, NOW, null)
        .timeZone,
    ).toBe("Europe/Kyiv");
  });
});

describe("loadUserClocks", () => {
  it("один запит за PK; людина без рядка отримує дефолтний годинник", async () => {
    const { pool, query } = poolWith([
      { user_id: "ny", push_daily_cap: 2, time_zone: "America/New_York" },
    ]);
    const clocks = await loadUserClocks(pool, ["ny", "kyiv"], NOW, null);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("FROM user_preferences"),
      [["ny", "kyiv"]],
    ]);
    expect(clocks.of("ny").hm).toBe("07:00");
    expect(clocks.of("kyiv").hm).toBe("14:00");
  });

  it("порожній список людей не ходить у БД", async () => {
    const { pool, query } = poolWith([]);
    const clocks = await loadUserClocks(pool, [], NOW, null);
    expect(query).not.toHaveBeenCalled();
    expect(clocks.of("any").timeZone).toBe("Europe/Kyiv");
  });

  it("дублікати id запитуються один раз", async () => {
    const { pool, query } = poolWith([]);
    await loadUserClocks(pool, ["a", "a", "b"], NOW, null);
    expect(query.mock.calls[0]?.[1]).toEqual([["a", "b"]]);
  });
});

describe("групування за день-ключем", () => {
  // 2026-12-01 03:30Z: у Нью-Йорку ще 30 листопада, у Києві й Токіо 1 грудня.
  const AT = new Date("2026-12-01T03:30:00Z");

  it("запит відміток іде раз на різний день-ключ, і результати зливаються", async () => {
    const { pool } = poolWith([
      { user_id: "ny", time_zone: "America/New_York" },
      { user_id: "tokyo", time_zone: "Asia/Tokyo" },
    ]);
    const clocks = await loadUserClocks(
      pool,
      ["ny", "tokyo", "kyiv"],
      AT,
      null,
    );

    expect(groupByDayKey(["ny", "tokyo", "kyiv"], clocks)).toEqual(
      new Map([
        ["2026-11-30", ["ny"]],
        ["2026-12-01", ["tokyo", "kyiv"]],
      ]),
    );

    const load = vi.fn(
      async (ids: string[], dayKey: string) =>
        new Map(ids.map((id) => [id, dayKey])),
    );
    const merged = await loadPerDayKey(["ny", "tokyo", "kyiv"], clocks, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(merged).toEqual(
      new Map([
        ["ny", "2026-11-30"],
        ["tokyo", "2026-12-01"],
        ["kyiv", "2026-12-01"],
      ]),
    );
  });

  it("без людей не робить жодного запиту", async () => {
    const { pool } = poolWith([]);
    const clocks = await loadUserClocks(pool, [], AT, null);
    const load = vi.fn(async () => new Map<string, string>());
    expect(await loadPerDayKey([], clocks, load)).toEqual(new Map());
    expect(load).not.toHaveBeenCalled();
  });
});
