import { describe, it, expect } from "vitest";
import {
  gradeCrossModuleLink,
  nextTierThreshold,
  tierWord,
  tierMeta,
  formatWeeksUk,
  formatObservationsUk,
  MIN_N,
  NOTABLE_R,
  REPEATING_N,
  STABLE_N,
  STRONG_R,
} from "./crossModuleLinkTiers";

describe("gradeCrossModuleLink", () => {
  it("mirrors digestCorrelations.ts thresholds (MIN_N=5, NOTABLE_R=0.4)", () => {
    expect(MIN_N).toBe(5);
    expect(NOTABLE_R).toBe(0.4);
  });

  it("returns null (right to be silent) below MIN_N observations", () => {
    expect(gradeCrossModuleLink(MIN_N - 1, 0.9)).toBeNull();
  });

  it("returns null below NOTABLE_R strength even with plenty of observations", () => {
    expect(gradeCrossModuleLink(50, NOTABLE_R - 0.01)).toBeNull();
  });

  it("returns null for non-finite inputs (NaN correlation guard)", () => {
    expect(gradeCrossModuleLink(NaN, 0.9)).toBeNull();
    expect(gradeCrossModuleLink(10, NaN)).toBeNull();
  });

  it("tier 1 — just crossed the silence threshold", () => {
    expect(gradeCrossModuleLink(MIN_N, NOTABLE_R)).toBe(1);
    expect(gradeCrossModuleLink(REPEATING_N - 1, 0.5)).toBe(1);
  });

  it("tier 2 — repeats beyond 2x MIN_N but under half the window and under STRONG_R", () => {
    expect(gradeCrossModuleLink(REPEATING_N, 0.5)).toBe(2);
    expect(gradeCrossModuleLink(STABLE_N - 1, STRONG_R - 0.01)).toBe(2);
  });

  it("tier 3 — covers half the analysis window", () => {
    expect(gradeCrossModuleLink(STABLE_N, 0.5)).toBe(3);
  });

  it("tier 3 — strong correlation alone is enough once repeating", () => {
    expect(gradeCrossModuleLink(REPEATING_N, STRONG_R)).toBe(3);
  });

  it("negative correlations grade on |r|, not sign", () => {
    expect(gradeCrossModuleLink(STABLE_N, -0.9)).toBe(3);
    expect(gradeCrossModuleLink(MIN_N, -NOTABLE_R)).toBe(1);
  });
});

describe("nextTierThreshold", () => {
  it("points tier 1 at REPEATING_N and tier 2 at STABLE_N", () => {
    expect(nextTierThreshold(1)).toBe(REPEATING_N);
    expect(nextTierThreshold(2)).toBe(STABLE_N);
  });

  it("tier 3 has no further threshold", () => {
    expect(nextTierThreshold(3)).toBeNull();
  });
});

describe("tierWord", () => {
  it("has distinct UA copy per tier", () => {
    expect(tierWord(1)).toBe("Поки що збіг");
    expect(tierWord(2)).toBe("Повторюється");
    expect(tierWord(3)).toBe("Тримається стабільно");
  });
});

describe("tierMeta", () => {
  it("degrades to observations-only when weeks is not supplied", () => {
    expect(tierMeta(1, 6)).toBe("6 спостережень");
  });

  it("prefixes weeks · observations for tier 1/2", () => {
    expect(tierMeta(1, 6, 2)).toBe("2 тижні · 6 спостережень");
  });

  it("uses 'поспіль' framing for tier 3", () => {
    expect(tierMeta(3, 23, 9)).toBe("9 тижнів поспіль · 23 спостереження");
  });
});

describe("uk-UA pluralisation (style-guide.uk.md §8)", () => {
  it("formatWeeksUk: one / few / many", () => {
    expect(formatWeeksUk(1)).toBe("1 тиждень");
    expect(formatWeeksUk(2)).toBe("2 тижні");
    expect(formatWeeksUk(4)).toBe("4 тижні");
    expect(formatWeeksUk(5)).toBe("5 тижнів");
    expect(formatWeeksUk(9)).toBe("9 тижнів");
  });

  it("formatObservationsUk: one / few / many", () => {
    expect(formatObservationsUk(1)).toBe("1 спостереження");
    expect(formatObservationsUk(3)).toBe("3 спостереження");
    expect(formatObservationsUk(5)).toBe("5 спостережень");
    expect(formatObservationsUk(23)).toBe("23 спостереження");
  });
});
