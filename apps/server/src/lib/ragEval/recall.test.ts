import { describe, expect, it } from "vitest";
import {
  DEFAULT_KILL_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  aggregateMetrics,
  aggregateRecall,
  classifyRecall,
  precisionAt1,
  recallAtK,
  reciprocalRank,
  statusToExitCode,
} from "./recall.js";

describe("recallAtK", () => {
  it("повертає 1 при empty expected (немає чого шукати)", () => {
    expect(recallAtK(["a", "b"], [], 4)).toBe(1);
  });

  it("повертає 0 при k <= 0", () => {
    expect(recallAtK(["a", "b"], ["a"], 0)).toBe(0);
    expect(recallAtK(["a", "b"], ["a"], -1)).toBe(0);
  });

  it("повертає 1.0 при full overlap у топ-K", () => {
    expect(recallAtK(["a", "b", "c", "d"], ["a", "b"], 4)).toBe(1);
  });

  it("повертає 0.0 при відсутньому overlap", () => {
    expect(recallAtK(["x", "y", "z"], ["a", "b"], 4)).toBe(0);
  });

  it("partial recall: 1/2 = 0.5", () => {
    expect(recallAtK(["a", "x"], ["a", "b"], 4)).toBe(0.5);
  });

  it("обрізає retrieved по K", () => {
    // Експ "b" у позиції 5 — поза топ-4 → recall@4 = 0.
    expect(recallAtK(["a", "x", "y", "z", "b"], ["b"], 4)).toBe(0);
    // Той самий retrieved при K=5 → recall = 1.
    expect(recallAtK(["a", "x", "y", "z", "b"], ["b"], 5)).toBe(1);
  });

  it("не падає коли retrieved коротший за K", () => {
    expect(recallAtK(["a"], ["a"], 4)).toBe(1);
  });

  it("трактує дублі у retrieved як set-семантика", () => {
    expect(recallAtK(["a", "a", "a"], ["a", "b"], 4)).toBe(0.5);
  });

  it("трактує дублі у expected як set-семантика", () => {
    // expected дедуплікується → знаменник = 1, не 3.
    expect(recallAtK(["a"], ["a", "a", "a"], 4)).toBe(1);
  });

  it("recall@4 типовий case: 3 з 5 у топ-4", () => {
    const retrieved = ["a", "b", "c", "x"];
    const expected = ["a", "b", "c", "d", "e"];
    // Hit-и: a, b, c → 3/5 = 0.6.
    expect(recallAtK(retrieved, expected, 4)).toBeCloseTo(0.6);
  });
});

describe("aggregateRecall", () => {
  it("empty input → нульова aggregate", () => {
    expect(aggregateRecall([])).toEqual({ count: 0, mean: 0, min: 0, p50: 0 });
  });

  it("обчислює mean / min / p50 для одного запиту", () => {
    expect(aggregateRecall([0.5])).toEqual({
      count: 1,
      mean: 0.5,
      min: 0.5,
      p50: 0.5,
    });
  });

  it("mean коректний для рівномірного розподілу", () => {
    const agg = aggregateRecall([0.5, 1.0, 0.0, 1.0]);
    expect(agg.mean).toBeCloseTo(0.625);
    expect(agg.min).toBe(0);
    expect(agg.count).toBe(4);
  });

  it("p50 — nearest-rank (не interpolated)", () => {
    // 5 значень: [0, 0.25, 0.5, 0.75, 1] → median = 0.5 (index 2).
    expect(aggregateRecall([0, 0.25, 0.5, 0.75, 1]).p50).toBe(0.5);
  });

  it("p50 при парній кількості — нижчий з двох центральних (nearest-rank semantics)", () => {
    // 4 значення: відсортовані [0.2, 0.4, 0.6, 0.8].
    // ceil(0.5 * 4) - 1 = 1 → значення 0.4.
    expect(aggregateRecall([0.4, 0.6, 0.2, 0.8]).p50).toBe(0.4);
  });

  it("кидає для значень поза [0,1]", () => {
    expect(() => aggregateRecall([0.5, 1.2])).toThrow(/in \[0,1\]/);
    expect(() => aggregateRecall([0.5, -0.1])).toThrow(/in \[0,1\]/);
    expect(() => aggregateRecall([0.5, NaN])).toThrow(/in \[0,1\]/);
  });
});

describe("classifyRecall", () => {
  it("mean >= warn → pass", () => {
    expect(classifyRecall(0.7).status).toBe("pass");
    expect(classifyRecall(DEFAULT_WARN_THRESHOLD).status).toBe("pass"); // boundary
  });

  it("warn > mean >= kill → warn", () => {
    expect(classifyRecall(0.45).status).toBe("warn");
    expect(classifyRecall(DEFAULT_KILL_THRESHOLD).status).toBe("warn"); // boundary
  });

  it("mean < kill → kill", () => {
    expect(classifyRecall(0.3).status).toBe("kill");
    expect(classifyRecall(0).status).toBe("kill");
  });

  it("повертає threshold-и для трасування у summary", () => {
    const c = classifyRecall(0.6);
    expect(c.warnThreshold).toBe(DEFAULT_WARN_THRESHOLD);
    expect(c.killThreshold).toBe(DEFAULT_KILL_THRESHOLD);
  });

  it("підтримує custom threshold-и", () => {
    expect(
      classifyRecall(0.6, { warnThreshold: 0.7, killThreshold: 0.5 }).status,
    ).toBe("warn");
    expect(
      classifyRecall(0.45, { warnThreshold: 0.7, killThreshold: 0.5 }).status,
    ).toBe("kill");
  });

  it("кидає коли killThreshold > warnThreshold (зворотний порядок)", () => {
    expect(() =>
      classifyRecall(0.5, { warnThreshold: 0.4, killThreshold: 0.6 }),
    ).toThrow(/killThreshold.*must be <= warnThreshold/);
  });

  it("кидає для non-finite mean", () => {
    expect(() => classifyRecall(NaN)).toThrow(/finite/);
    expect(() => classifyRecall(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

describe("statusToExitCode", () => {
  it("pass → 0, warn → 1, kill → 2", () => {
    expect(statusToExitCode("pass")).toBe(0);
    expect(statusToExitCode("warn")).toBe(1);
    expect(statusToExitCode("kill")).toBe(2);
  });
});

describe("precisionAt1", () => {
  it("повертає 1 коли retrieved[0] у expected", () => {
    expect(precisionAt1(["a", "b", "c"], ["a", "z"])).toBe(1);
  });

  it("повертає 0 коли retrieved[0] не у expected", () => {
    expect(precisionAt1(["x", "a", "b"], ["a", "b"])).toBe(0);
  });

  it("повертає 1 при empty expected (trivially)", () => {
    expect(precisionAt1(["a"], [])).toBe(1);
  });

  it("повертає 0 при empty retrieved", () => {
    expect(precisionAt1([], ["a"])).toBe(0);
  });

  it("трактує expected як set (дублі не впливають)", () => {
    expect(precisionAt1(["a"], ["a", "a", "a"])).toBe(1);
  });
});

describe("reciprocalRank", () => {
  it("RR = 1 коли expected на позиції 1", () => {
    expect(reciprocalRank(["a", "x", "y"], ["a"])).toBe(1);
  });

  it("RR = 0.5 коли expected на позиції 2", () => {
    expect(reciprocalRank(["x", "a", "y"], ["a"])).toBe(0.5);
  });

  it("RR = 0.25 коли expected на позиції 4", () => {
    expect(reciprocalRank(["x", "y", "z", "a"], ["a"])).toBe(0.25);
  });

  it("повертає RR першого hit-у (не середнє)", () => {
    // expected = [a, b]; a@pos 3, b@pos 2 → RR = 1/2.
    expect(reciprocalRank(["x", "b", "a"], ["a", "b"])).toBe(0.5);
  });

  it("повертає 0 коли жоден expected не у retrieved", () => {
    expect(reciprocalRank(["x", "y", "z"], ["a", "b"])).toBe(0);
  });

  it("повертає 1 при empty expected", () => {
    expect(reciprocalRank(["a"], [])).toBe(1);
  });

  it("повертає 0 при empty retrieved", () => {
    expect(reciprocalRank([], ["a"])).toBe(0);
  });
});

describe("aggregateMetrics", () => {
  it("empty input → нульовий bundle", () => {
    const bundle = aggregateMetrics([]);
    expect(bundle.recallAtK.count).toBe(0);
    expect(bundle.precisionAt1.count).toBe(0);
    expect(bundle.mrr.count).toBe(0);
  });

  it("aggregateляє все три метрики паралельно", () => {
    const bundle = aggregateMetrics([
      { recall: 1, precisionAt1: 1, reciprocalRank: 1 },
      { recall: 0.5, precisionAt1: 0, reciprocalRank: 0.5 },
      { recall: 0, precisionAt1: 0, reciprocalRank: 0 },
    ]);
    expect(bundle.recallAtK.mean).toBeCloseTo(0.5);
    expect(bundle.precisionAt1.mean).toBeCloseTo(1 / 3);
    expect(bundle.mrr.mean).toBeCloseTo(0.5);
  });

  it("P@1 mean — фактично fraction-hits@1", () => {
    // 5 query, з яких 2 hit-нули на pos 1 → P@1 mean = 0.4.
    const bundle = aggregateMetrics([
      { recall: 1, precisionAt1: 1, reciprocalRank: 1 },
      { recall: 1, precisionAt1: 1, reciprocalRank: 1 },
      { recall: 0.5, precisionAt1: 0, reciprocalRank: 0.5 },
      { recall: 0.5, precisionAt1: 0, reciprocalRank: 0.5 },
      { recall: 0, precisionAt1: 0, reciprocalRank: 0 },
    ]);
    expect(bundle.precisionAt1.mean).toBeCloseTo(0.4);
  });
});
