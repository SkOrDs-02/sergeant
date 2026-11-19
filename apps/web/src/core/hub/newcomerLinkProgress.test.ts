import { describe, expect, it } from "vitest";
import type { DailySeries } from "../lib/chatActions/crossActions/dailySeries";
import { newcomerLinkProgressFromSeries } from "./newcomerLinkProgress";

function series(raw: DailySeries["raw"], days: string[]): DailySeries {
  return {
    from: days[0] ?? "",
    to: days[days.length - 1] ?? "",
    days,
    raw,
    metrics: Object.keys(raw) as DailySeries["metrics"],
  };
}

const DAYS = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

describe("newcomerLinkProgressFromSeries", () => {
  it("спільні дні — найближча до порога крос-модульна пара; звʼязку ще немає", () => {
    const progress = newcomerLinkProgressFromSeries(
      series(
        {
          spending: [100, 200, undefined, 300],
          kcal: [1800, 2000, 2100, 1900],
        },
        DAYS,
      ),
    );
    expect(progress).toEqual({ sharedDays: 3, linkFound: false });
  });

  it("порожні ряди: нуль днів", () => {
    expect(newcomerLinkProgressFromSeries(series({}, DAYS))).toEqual({
      sharedDays: 0,
      linkFound: false,
    });
  });
});
