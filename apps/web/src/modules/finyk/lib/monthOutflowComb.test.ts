import { describe, it, expect } from "vitest";
import {
  buildMonthComb,
  MIN_GAP_DAYS,
  type CombEntry,
} from "./monthOutflowComb";

const sub = (
  id: string,
  billingDay: number,
  amount: number | null,
  name = id,
): CombEntry => ({ id, name, billingDay, amount });

describe("buildMonthComb", () => {
  it("buckets each payment onto its billing day", () => {
    const r = buildMonthComb([sub("a", 3, 399), sub("b", 8, 2400)], 31);
    expect(r.days).toHaveLength(31);
    expect(r.days[2]?.total).toBe(399);
    expect(r.days[7]?.total).toBe(2400);
    expect(r.total).toBe(2799);
    expect(r.max).toBe(2400);
    expect(r.counted).toBe(2);
  });

  it("sums several payments landing on the same day", () => {
    const r = buildMonthComb(
      [sub("a", 5, 159, "Spotify"), sub("b", 5, 300, "Київстар")],
      31,
    );
    expect(r.days[4]?.total).toBe(459);
    expect(r.days[4]?.names).toEqual(["Spotify", "Київстар"]);
    expect(r.max).toBe(459);
  });

  // AI-CONTEXT: це не косметична межа. Підписка «31-го» в 30-денному
  // місяці справді списується останнього дня; якби ми її відкидали,
  // сума гребеня розійшлася б із сумою списку — і розбіжність було б
  // видно лише в лютому.
  it("clamps a billing day past the end of the month onto the last day", () => {
    const r = buildMonthComb([sub("a", 31, 500)], 30);
    expect(r.days[29]?.total).toBe(500);
    expect(r.total).toBe(500);
    expect(r.counted).toBe(1);
  });

  it("clamps to the last day of February too", () => {
    const r = buildMonthComb([sub("a", 30, 120), sub("b", 28, 80)], 28);
    expect(r.days).toHaveLength(28);
    expect(r.days[27]?.total).toBe(200);
  });

  it("skips payments with an unknown or non-positive amount", () => {
    const r = buildMonthComb(
      [sub("a", 4, null), sub("b", 6, 0), sub("c", 9, -50), sub("d", 12, 200)],
      31,
    );
    expect(r.counted).toBe(1);
    expect(r.total).toBe(200);
    expect(r.days[3]?.total).toBe(0);
    expect(r.days[5]?.total).toBe(0);
    expect(r.days[8]?.total).toBe(0);
  });

  it("ignores a nonsensical billing day instead of throwing", () => {
    const r = buildMonthComb(
      [sub("a", 0, 100), sub("b", Number.NaN, 100), sub("c", -3, 100)],
      31,
    );
    expect(r.counted).toBe(0);
    expect(r.total).toBe(0);
  });

  it("returns an empty month for no entries", () => {
    const r = buildMonthComb([], 31);
    expect(r.total).toBe(0);
    expect(r.max).toBe(0);
    expect(r.counted).toBe(0);
    // Порожній місяць — це один суцільний провал, і він правдивий.
    expect(r.gap).toEqual({ from: 1, to: 31, length: 31 });
  });
});

describe("buildMonthComb · провал", () => {
  it("finds the longest run of empty days between payments", () => {
    // Списання 3, 5, 6, 8, 9 і 24 — провал 10..23 включно.
    const r = buildMonthComb(
      [
        sub("a", 3, 399),
        sub("b", 5, 159),
        sub("c", 6, 300),
        sub("d", 8, 2400),
        sub("e", 9, 1200),
        sub("f", 24, 99),
      ],
      31,
    );
    expect(r.gap).toEqual({ from: 10, to: 23, length: 14 });
  });

  // AI-CONTEXT: хвіст місяця рахується навмисно — «з 25-го і до кінця
  // нічого не йде» відповідає на те саме питання, що й провал усередині.
  it("counts the tail after the last payment as a gap", () => {
    const r = buildMonthComb([sub("a", 2, 100), sub("b", 4, 100)], 31);
    expect(r.gap).toEqual({ from: 5, to: 31, length: 27 });
  });

  it("counts the head before the first payment as a gap", () => {
    const r = buildMonthComb([sub("a", 20, 100), sub("b", 21, 100)], 22);
    expect(r.gap).toEqual({ from: 1, to: 19, length: 19 });
  });

  it("reports nothing when every empty run is shorter than the threshold", () => {
    // Платежі через день: найдовший провал — 1 день.
    const entries = [1, 3, 5, 7, 9].map((d) => sub(`s${d}`, d, 50));
    const r = buildMonthComb(entries, 9);
    expect(r.gap).toBeNull();
  });

  it("uses MIN_GAP_DAYS as the inclusive lower bound", () => {
    const days = MIN_GAP_DAYS + 2;
    // Платіж 1-го, далі порожньо рівно MIN_GAP_DAYS днів, потім останній.
    const r = buildMonthComb([sub("a", 1, 100), sub("b", days, 100)], days);
    expect(r.gap).toEqual({ from: 2, to: days - 1, length: MIN_GAP_DAYS });
  });

  it("keeps the longer of two gaps", () => {
    const r = buildMonthComb(
      [sub("a", 1, 100), sub("b", 8, 100), sub("c", 20, 100)],
      20,
    );
    // 2..7 — 6 днів, 9..19 — 11 днів.
    expect(r.gap).toEqual({ from: 9, to: 19, length: 11 });
  });
});
