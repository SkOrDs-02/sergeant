import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => ({ query: vi.fn() }));
vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn() },
}));

import { query as _query } from "../../db.js";
import {
  NBU_MAX_FETCHES_PER_CALL,
  getNbuRates,
  nbuRateKey,
  type FetchLike,
} from "./nbuRate.js";

const queryMock = _query as unknown as Mock;

/** Відповіді НБУ за датою (YYYYMMDD у URL): масив курсів або збій. */
function nbu(days: Record<string, Array<[number, number]> | "fail">) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const date = /date=(\d{8})/.exec(url)?.[1] ?? "";
    calls.push(date);
    const day = days[date];
    if (day === undefined || day === "fail") throw new Error("network");
    return {
      ok: true,
      json: async () => day.map(([r030, rate]) => ({ r030, rate })),
    };
  };
  return { fetchImpl, calls };
}

beforeEach(() => {
  queryMock.mockReset();
  // Кеш порожній, запис - без рядків.
  queryMock.mockResolvedValue({ rows: [] });
});

const TODAY = "2026-11-25";

describe("getNbuRates", () => {
  it("returns cached rates without calling the NBU", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          currency_code: 840,
          rate_date: "2026-11-24",
          uah_per_unit: "41.500000",
          source_date: "2026-11-24",
        },
      ],
    });
    const { fetchImpl, calls } = nbu({});
    const rates = await getNbuRates(
      [{ currencyCode: 840, date: "2026-11-24" }],
      { fetchImpl, today: TODAY },
    );
    expect(rates.get(nbuRateKey(840, "2026-11-24"))).toEqual({
      uahPerUnit: 41.5,
      sourceDate: "2026-11-24",
    });
    expect(calls).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("fetches a missing rate once per day and stores it without overwriting", async () => {
    const { fetchImpl, calls } = nbu({
      "20261124": [
        [840, 41.5],
        [978, 44.1],
      ],
    });
    const rates = await getNbuRates(
      [
        { currencyCode: 840, date: "2026-11-24" },
        { currencyCode: 978, date: "2026-11-24" },
        { currencyCode: 840, date: "2026-11-24" },
      ],
      { fetchImpl, today: TODAY },
    );
    expect(calls).toEqual(["20261124"]);
    expect(rates.get(nbuRateKey(978, "2026-11-24"))?.uahPerUnit).toBe(44.1);
    const insert = queryMock.mock.calls[1]!;
    expect(insert[0]).toContain(
      "ON CONFLICT (currency_code, rate_date) DO NOTHING",
    );
    expect(insert[1]).toEqual([
      [840, 978],
      ["2026-11-24", "2026-11-24"],
      [41.5, 44.1],
      ["2026-11-24", "2026-11-24"],
    ]);
  });

  it("falls back to the nearest earlier date for a past date and keeps the source date", async () => {
    const { fetchImpl, calls } = nbu({
      "20261122": [],
      "20261121": [[840, 41.2]],
    });
    const rates = await getNbuRates(
      [{ currencyCode: 840, date: "2026-11-22" }],
      { fetchImpl, today: TODAY },
    );
    expect(calls).toEqual(["20261122", "20261121"]);
    expect(rates.get(nbuRateKey(840, "2026-11-22"))).toEqual({
      uahPerUnit: 41.2,
      sourceDate: "2026-11-21",
    });
  });

  it("does not fall back for today: an empty answer means no rate yet", async () => {
    const { fetchImpl, calls } = nbu({
      "20261125": [],
      "20261124": [[840, 41]],
    });
    const rates = await getNbuRates([{ currencyCode: 840, date: TODAY }], {
      fetchImpl,
      today: TODAY,
    });
    expect(calls).toEqual(["20261125"]);
    expect(rates.size).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("a NBU failure yields no rate and no fallback to an older day", async () => {
    const { fetchImpl, calls } = nbu({
      "20261120": "fail",
      "20261119": [[840, 41]],
    });
    const rates = await getNbuRates(
      [{ currencyCode: 840, date: "2026-11-20" }],
      { fetchImpl, today: TODAY },
    );
    expect(calls).toEqual(["20261120"]);
    expect(rates.size).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("a malformed NBU entry fails the day instead of falling back to an older rate", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(/date=(\d{8})/.exec(url)?.[1] ?? "");
      return {
        ok: true,
        json: async () => [
          { r030: 840, rate: "n/a" },
          { r030: 978, rate: 44 },
        ],
      };
    };
    const rates = await getNbuRates(
      [{ currencyCode: 840, date: "2026-11-20" }],
      { fetchImpl, today: TODAY },
    );
    expect(calls).toEqual(["20261120"]);
    expect(rates.size).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("stops calling the NBU after the first failure in a call", async () => {
    const { fetchImpl, calls } = nbu({
      "20261120": "fail",
      "20261118": [[840, 41]],
    });
    const rates = await getNbuRates(
      [
        { currencyCode: 840, date: "2026-11-20" },
        { currencyCode: 840, date: "2026-11-18" },
      ],
      { fetchImpl, today: TODAY },
    );
    expect(calls).toEqual(["20261120"]);
    expect(rates.size).toBe(0);
  });

  it("caps NBU requests per call", async () => {
    const days: Record<string, Array<[number, number]>> = {};
    const pairs = Array.from(
      { length: NBU_MAX_FETCHES_PER_CALL + 5 },
      (_, i) => {
        const date = new Date(Date.UTC(2026, 9, 1 + i))
          .toISOString()
          .slice(0, 10);
        days[date.replaceAll("-", "")] = [[840, 41]];
        return { currencyCode: 840, date };
      },
    );
    const { fetchImpl, calls } = nbu(days);
    const rates = await getNbuRates(pairs, { fetchImpl, today: TODAY });
    expect(calls).toHaveLength(NBU_MAX_FETCHES_PER_CALL);
    expect(rates.size).toBe(NBU_MAX_FETCHES_PER_CALL);
  });
});
