/**
 * Юніт-тести для `krProgressPct` та структури `INTERIM_OKRS`.
 *
 * `krProgressPct` — pure function: ніяких залежностей, ніяких моків.
 * Три кейси: happy-path (нормальна ціль), inverse-goal (target=0),
 * and overshoot (capped до 100).
 */

import { describe, expect, it } from "vitest";
import { krProgressPct, INTERIM_OKRS } from "./okrs.js";
import type { KeyResult } from "./okrs.js";

function kr(
  target: number,
  current: number,
  overrides: Partial<KeyResult> = {},
): KeyResult {
  return {
    label: "Test KR",
    target,
    current,
    unit: "units",
    source: "manual",
    ...overrides,
  };
}

describe("krProgressPct — happy path", () => {
  it("повертає коректний відсоток для нормальної цілі", () => {
    expect(krProgressPct(kr(100, 50))).toBe(50);
    expect(krProgressPct(kr(50, 25))).toBe(50);
    expect(krProgressPct(kr(200, 100))).toBe(50);
  });

  it("повертає 0 коли current = 0", () => {
    expect(krProgressPct(kr(100, 0))).toBe(0);
  });

  it("повертає 100 коли current >= target (capped overshoot)", () => {
    expect(krProgressPct(kr(100, 100))).toBe(100);
    expect(krProgressPct(kr(100, 150))).toBe(100);
    expect(krProgressPct(kr(50, 999))).toBe(100);
  });
});

describe("krProgressPct — inverse goal (target=0)", () => {
  it("повертає 100 коли current = 0 (ціль досягнута — нуль проблем)", () => {
    expect(krProgressPct(kr(0, 0))).toBe(100);
  });

  it("повертає 0 коли current > 0 (є відкриті issues — ціль не досягнута)", () => {
    expect(krProgressPct(kr(0, 1))).toBe(0);
    expect(krProgressPct(kr(0, 42))).toBe(0);
  });
});

describe("INTERIM_OKRS структура", () => {
  it("містить щонайменше 2 OKR-и з непустими id та krs", () => {
    expect(INTERIM_OKRS.length).toBeGreaterThanOrEqual(2);
    for (const okr of INTERIM_OKRS) {
      expect(typeof okr.id).toBe("string");
      expect(okr.id.length).toBeGreaterThan(0);
      expect(okr.krs.length).toBeGreaterThan(0);
    }
  });

  it("krProgressPct працює без кидання на всіх OKR-ах INTERIM_OKRS", () => {
    for (const okr of INTERIM_OKRS) {
      for (const kr of okr.krs) {
        const pct = krProgressPct(kr);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });
});
