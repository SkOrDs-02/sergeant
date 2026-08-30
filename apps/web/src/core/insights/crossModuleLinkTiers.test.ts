import { describe, it, expect } from "vitest";
import {
  gradeCrossModuleLink,
  nextDaysThreshold,
  tierWord,
  tierMeta,
  formatWeeksUk,
  formatObservationsUk,
  MIN_N,
  NOTABLE_R,
  REPEATING_R,
  STABLE_N,
  STRONG_R,
} from "./crossModuleLinkTiers";

describe("gradeCrossModuleLink", () => {
  it("mirrors digestCorrelations.ts thresholds (MIN_N=10, NOTABLE_R=0.4)", () => {
    expect(MIN_N).toBe(10);
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

  it("tier 1 — сила щойно за порогом помітності", () => {
    expect(gradeCrossModuleLink(MIN_N, NOTABLE_R)).toBe(1);
    expect(gradeCrossModuleLink(STABLE_N * 2, REPEATING_R - 0.01)).toBe(1);
  });

  it("tier 2 — сила помітно вища за поріг, але ще не сильна", () => {
    expect(gradeCrossModuleLink(MIN_N, REPEATING_R)).toBe(2);
    expect(gradeCrossModuleLink(STABLE_N * 2, STRONG_R - 0.01)).toBe(2);
  });

  it("tier 3 — потрібні ОБИДВІ умови: сила ≥ STRONG_R і днів ≥ STABLE_N", () => {
    expect(gradeCrossModuleLink(STABLE_N, STRONG_R)).toBe(3);
  });

  /**
   * Регресія на схлопнуту драбину (AI-DANGER у `crossModuleLinkTiers.ts`).
   *
   * Раніше умова була `n ≥ STABLE_N АБО |r| ≥ STRONG_R`. Після фіксу
   * структурних нулів `n` став однаковим для всіх пар і майже завжди
   * більшим за 30, тож перша половина «або» вмикала третій ступінь навіть
   * на межовій кореляції — слово впевненості переставало щось означати.
   */
  it("багато днів САМІ ПО СОБІ третього ступеня не дають", () => {
    expect(gradeCrossModuleLink(STABLE_N * 2, NOTABLE_R + 0.01)).toBe(1);
    expect(gradeCrossModuleLink(59, 0.41)).toBe(1);
    expect(gradeCrossModuleLink(59, 0.6)).toBe(2);
  });

  it("сильна кореляція САМА ПО СОБІ третього ступеня не дає", () => {
    expect(gradeCrossModuleLink(MIN_N, 0.95)).toBe(2);
    expect(gradeCrossModuleLink(STABLE_N - 1, STRONG_R)).toBe(2);
  });

  it("negative correlations grade on |r|, not sign", () => {
    expect(gradeCrossModuleLink(STABLE_N, -0.9)).toBe(3);
    expect(gradeCrossModuleLink(MIN_N, -NOTABLE_R)).toBe(1);
  });
});

describe("nextDaysThreshold", () => {
  it("до порога мовчання ціль: MIN_N", () => {
    expect(nextDaysThreshold(0)).toBe(MIN_N);
    expect(nextDaysThreshold(MIN_N - 1)).toBe(MIN_N);
  });

  it("між MIN_N і STABLE_N ціль: STABLE_N", () => {
    expect(nextDaysThreshold(MIN_N)).toBe(STABLE_N);
    expect(nextDaysThreshold(STABLE_N - 1)).toBe(STABLE_N);
  });

  it("після STABLE_N дні більше нічого не змінюють", () => {
    expect(nextDaysThreshold(STABLE_N)).toBeNull();
    expect(nextDaysThreshold(59)).toBeNull();
  });

  it("не падає на нечислових входах", () => {
    expect(nextDaysThreshold(NaN)).toBeNull();
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

  // Регресія: поріг сегмента — сирий `weeks < 1`, не округлений. Інакше 0.6
  // тижня давало «1 тиждень» — дописаний тиждень спостережень, якого не було.
  it("drops the weeks segment for a partial first week", () => {
    expect(tierMeta(1, 6, 0.5)).toBe("6 спостережень");
    expect(tierMeta(1, 6, 0.9)).toBe("6 спостережень");
  });

  it("floors a fractional week instead of rounding it up", () => {
    expect(tierMeta(1, 6, 1.5)).toBe("1 тиждень · 6 спостережень");
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

  // Повні тижні, а не найближчі: 0.5 — це нуль повних тижнів, 1.5 — один.
  it("formatWeeksUk: floors fractions, never rounds up", () => {
    expect(formatWeeksUk(0.5)).toBe("0 тижнів");
    expect(formatWeeksUk(1.5)).toBe("1 тиждень");
    expect(formatWeeksUk(2.9)).toBe("2 тижні");
    expect(formatWeeksUk(-3)).toBe("0 тижнів");
  });

  it("formatObservationsUk: one / few / many", () => {
    expect(formatObservationsUk(1)).toBe("1 спостереження");
    expect(formatObservationsUk(3)).toBe("3 спостереження");
    expect(formatObservationsUk(5)).toBe("5 спостережень");
    expect(formatObservationsUk(23)).toBe("23 спостереження");
  });
});
