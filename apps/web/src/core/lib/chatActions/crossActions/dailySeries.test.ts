// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildDailySeries,
  computePairwiseCorrelations,
  formatDailySeries,
  getDailySeries,
  type DailySeries,
} from "./dailySeries";

function series(
  metrics: DailySeries["metrics"],
  raw: DailySeries["raw"],
  n: number,
): DailySeries {
  const days = Array.from(
    { length: n },
    (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
  );
  return { from: days[0]!, to: days[n - 1]!, days, raw, metrics };
}

describe("computePairwiseCorrelations", () => {
  it("perfect positive correlation → r ≈ 1", () => {
    const s = series(
      ["spending", "income"],
      { spending: [1, 2, 3, 4], income: [2, 4, 6, 8] },
      4,
    );
    const [c] = computePairwiseCorrelations(s);
    expect(c).toBeDefined();
    expect(c!.pearson).toBeCloseTo(1, 5);
    expect(c!.spearman).toBeCloseTo(1, 5);
    expect(c!.n).toBe(4);
  });

  it("perfect inverse correlation → r ≈ -1", () => {
    const s = series(
      ["weight", "kcal"],
      { weight: [1, 2, 3, 4], kcal: [8, 6, 4, 2] },
      4,
    );
    const [c] = computePairwiseCorrelations(s);
    expect(c!.pearson).toBeCloseTo(-1, 5);
  });

  it("only pairwise-complete days count; skips pairs with < 4 common points", () => {
    // Common non-undefined indices: 0, 2, 4 → n=3 → skipped.
    const s = series(
      ["spending", "weight"],
      {
        spending: [1, 2, 3, undefined, 5],
        weight: [2, undefined, 6, 8, 10],
      },
      5,
    );
    expect(computePairwiseCorrelations(s)).toHaveLength(0);
  });

  it("pairwise-complete filtering: ignores days where either metric is missing", () => {
    const s = series(
      ["spending", "income"],
      {
        // day 3 spending missing → dropped from the pair, rest perfectly correlated
        spending: [1, 2, undefined, 4, 5],
        income: [10, 20, 30, 40, 50],
      },
      5,
    );
    const [c] = computePairwiseCorrelations(s);
    expect(c!.n).toBe(4);
    expect(c!.pearson).toBeCloseTo(1, 5);
  });

  it("flat metric (zero variance) → NaN, not a crash", () => {
    const s = series(
      ["water", "spending"],
      { water: [5, 5, 5, 5], spending: [1, 2, 3, 4] },
      4,
    );
    const [c] = computePairwiseCorrelations(s);
    expect(Number.isNaN(c!.pearson)).toBe(true);
  });
});

describe("formatDailySeries — fill semantics", () => {
  const s = series(
    ["spending", "weight"],
    { spending: [100, undefined, 300], weight: [80, 81, undefined] },
    3,
  );
  const corr = computePairwiseCorrelations(s);

  it("fill=zero renders missing cells as 0", () => {
    const out = formatDailySeries(s, corr, "zero");
    expect(out).toContain("2026-01-02,0,81");
    expect(out).toContain("2026-01-03,300,0");
  });

  it("fill=null renders missing cells as empty", () => {
    const out = formatDailySeries(s, corr, "null");
    expect(out).toContain("2026-01-02,,81");
    expect(out).toContain("2026-01-03,300,");
  });
});

describe("getDailySeries — executor", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("error: no valid metrics returns guidance", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: { metrics: [] },
    });
    expect(out).toContain("Вкажи");
  });

  it("error: only invalid metric names → guidance", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: { metrics: ["nonsense", "bogus"] },
    });
    expect(out).toContain("Вкажи");
  });

  it("happy: seeded finyk txs correlate spending ↔ income across days", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const txs: Array<{ id: string; amount: number; time: number }> = [];
    // 5 consecutive days, one expense + one (proportional) income each.
    for (let d = 0; d < 5; d++) {
      const t = nowSec - d * 86400;
      txs.push({ id: `e${d}`, amount: -(1000 + d * 100) * 100, time: t });
      txs.push({ id: `i${d}`, amount: (2000 + d * 200) * 100, time: t });
    }
    localStorage.setItem("finyk_tx_cache", JSON.stringify({ txs }));

    const out = getDailySeries({
      name: "get_daily_series",
      input: { metrics: ["spending", "income"] },
    });
    expect(out).toContain("Кореляції");
    expect(out).toContain("spending ↔ income");
    expect(out).toContain("day,spending,income");
  });

  it("caps metrics to 6 and dedupes", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: [
          "spending",
          "spending",
          "income",
          "kcal",
          "protein",
          "water",
          "weight",
          "wellbeing",
        ],
      },
    });
    // Header lists at most 6 distinct metrics.
    const header = out.split("\n").find((l) => l.startsWith("day,"));
    expect(header).toBeDefined();
    const cols = header!.replace("day,", "").split(",");
    expect(cols.length).toBeLessThanOrEqual(6);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it("graceful with empty stores: single metric, no data", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: { metrics: ["spending"] },
    });
    expect(out).toContain("Підсумки");
    expect(out).toContain("spending: немає даних");
  });
});

describe("buildDailySeries — alignment", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("aligns finyk spending onto the correct Kyiv day and leaves gaps undefined", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [{ id: "e0", amount: -5000 * 100, time: nowSec }],
      }),
    );
    const s = buildDailySeries(["spending"], {
      from: "2026-04-20",
      to: "2026-04-22",
    });
    expect(s.days).toEqual(["2026-04-20", "2026-04-21", "2026-04-22"]);
    const col = s.raw["spending"]!;
    expect(col[0]).toBeUndefined();
    expect(col[1]).toBeUndefined();
    expect(col[2]).toBe(5000);
  });
});
