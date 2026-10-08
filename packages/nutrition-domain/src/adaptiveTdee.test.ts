import { describe, expect, it } from "vitest";
import {
  clampGoalDelta,
  isDayFullyLogged,
  measuredTdee,
  measuredTdeeFromBalance,
  weightTrendEma,
  type IntakeDay,
  type WeightPoint,
} from "./adaptiveTdee.js";

const intake = (count: number, kcal = 2000): IntakeDay[] =>
  Array.from({ length: count }, (_, index) => ({
    dateKey: `2026-05-${String(index + 1).padStart(2, "0")}`,
    kcal,
    complete: true,
  }));

const weights = (values: number[]): WeightPoint[] =>
  values.map((weightKg, index) => ({
    dateKey: `2026-05-${String(1 + index * 4).padStart(2, "0")}`,
    weightKg,
  }));

describe("measuredTdee", () => {
  it("matches the 14-day energy-balance golden case", () => {
    expect(measuredTdeeFromBalance(2000, -0.5, 14)).toBe(2275);
  });

  it("uses the correct energy-balance sign for weight loss", () => {
    const result = measuredTdee(intake(14), [
      { dateKey: "2026-05-01", weightKg: 80 },
      { dateKey: "2026-05-05", weightKg: 79.8 },
      { dateKey: "2026-05-10", weightKg: 79.6 },
      { dateKey: "2026-05-15", weightKg: 79.5 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.tdeeKcal).toBeGreaterThan(result!.averageIntakeKcal);
  });

  it("does not update with only nine complete days", () => {
    expect(measuredTdee(intake(9), weights([80, 79.9, 79.8, 79.7]))).toBeNull();
  });

  it("does not update with fewer than four weigh-ins", () => {
    expect(measuredTdee(intake(14), weights([80, 79.9, 79.8]))).toBeNull();
  });

  it("ignores incomplete, invalid, and non-positive source rows", () => {
    const result = measuredTdee(
      [
        ...intake(10),
        { dateKey: "2026-05-15", kcal: 0, complete: true },
        { dateKey: "not-a-day", kcal: 2500, complete: true },
        { dateKey: "2026-05-16", kcal: 2500, complete: false },
      ],
      [
        ...weights([80, 79.9, 79.8, 79.7]),
        { dateKey: "not-a-day", weightKg: 70 },
        { dateKey: "2026-05-20", weightKg: 0 },
      ],
    );
    expect(result).not.toBeNull();
    expect(result!.completeDays).toBe(10);
    expect(result!.weightPoints).toBe(4);
  });

  it("rejects invalid energy-balance inputs and non-positive results", () => {
    expect(measuredTdeeFromBalance(0, 0, 14)).toBeNull();
    expect(measuredTdeeFromBalance(Number.NaN, 0, 14)).toBeNull();
    expect(
      measuredTdeeFromBalance(2000, Number.POSITIVE_INFINITY, 14),
    ).toBeNull();
    expect(measuredTdeeFromBalance(2000, 0, 0)).toBeNull();
    expect(measuredTdeeFromBalance(100, 1, 1)).toBeNull();
  });

  it("does not produce a result when weight points have no time span", () => {
    expect(
      measuredTdee(intake(10), [
        { dateKey: "2026-05-01", weightKg: 80 },
        { dateKey: "2026-05-01", weightKg: 79.9 },
        { dateKey: "2026-05-01", weightKg: 79.8 },
        { dateKey: "2026-05-01", weightKg: 79.7 },
      ]),
    ).toBeNull();
  });
});

/** 14 щоденних замірів (вікно хука: end = вчора, start = end - 13). */
const dailyWeights = (weightAt: (dayIndex: number) => number): WeightPoint[] =>
  Array.from({ length: 14 }, (_, index) => ({
    dateKey: `2026-05-${String(index + 1).padStart(2, "0")}`,
    weightKg: weightAt(index),
  }));

/**
 * logic-05: раніше `startKg` був СИРИМ першим заміром, а `endKg` — EMA з
 * лагом, тож `deltaKg` на 14-денному вікні виходила вдвічі заниженою.
 * Регресійні кейси нижче без фіксу дають TDEE ≈2358 і ≈2343 відповідно.
 */
describe("measuredTdee: тренд ваги без асиметрії старт/кінець (logic-05)", () => {
  it("лінійна втрата 0,1 кг/день без шуму: TDEE = споживання + 0,1 × 7700", () => {
    const result = measuredTdee(
      intake(14, 2000),
      dailyWeights((i) => 80 - 0.1 * i),
    );
    expect(result).not.toBeNull();
    expect(result!.weightDeltaKg).toBeCloseTo(-1.3, 6);
    expect(result!.days).toBe(13);
    // 2000 + 1.3 × 7700 / 13 = 2770
    expect(Math.abs(result!.tdeeKcal - 2770)).toBeLessThanOrEqual(20);
  });

  it("лінійний набір 0,05 кг/день: TDEE = споживання - 0,05 × 7700", () => {
    const result = measuredTdee(
      intake(14, 2500),
      dailyWeights((i) => 80 + 0.05 * i),
    );
    expect(result).not.toBeNull();
    // 2500 - 0.65 × 7700 / 13 = 2115
    expect(Math.abs(result!.tdeeKcal - 2115)).toBeLessThanOrEqual(20);
  });

  it("стабільна вага з «водяним» першим заміром +0,8 кг: TDEE близько до споживання", () => {
    const result = measuredTdee(
      intake(14, 2000),
      dailyWeights((i) => (i === 0 ? 80.8 : 80)),
    );
    expect(result).not.toBeNull();
    // Регресія розмазує один викид по нахилу (≈ +176); без фіксу було ≈ +343.
    expect(Math.abs(result!.tdeeKcal - 2000)).toBeLessThanOrEqual(200);
  });

  it("startKg/endKg лежать на лінії тренду й узгоджені з deltaKg", () => {
    const trend = weightTrendEma(dailyWeights((i) => 80 - 0.1 * i));
    expect(trend).not.toBeNull();
    expect(trend!.startKg).toBeCloseTo(80, 6);
    expect(trend!.endKg).toBeCloseTo(78.7, 6);
    expect(trend!.endKg - trend!.startKg).toBeCloseTo(trend!.deltaKg, 9);
    expect(trend!.spanDays).toBe(13);
  });

  it("нерівномірні заміри й порядок входу не міняють тренд", () => {
    const sparse: WeightPoint[] = [
      { dateKey: "2026-05-14", weightKg: 78.7 },
      { dateKey: "2026-05-01", weightKg: 80 },
      { dateKey: "2026-05-05", weightKg: 79.6 },
      { dateKey: "2026-05-10", weightKg: 79.1 },
    ];
    const trend = weightTrendEma(sparse);
    expect(trend!.deltaKg).toBeCloseTo(-1.3, 6);
  });
});

describe("weightTrendEma", () => {
  it("dampens a one-day 1.5 kg water jump", () => {
    const stable = weightTrendEma([
      { dateKey: "2026-05-01", weightKg: 80 },
      { dateKey: "2026-05-07", weightKg: 80 },
      { dateKey: "2026-05-08", weightKg: 81.5 },
      { dateKey: "2026-05-14", weightKg: 80 },
    ]);
    expect(Math.abs(stable!.deltaKg)).toBeLessThan(0.3);
  });

  it("returns null for fewer than two usable points or zero span", () => {
    expect(
      weightTrendEma([{ dateKey: "2026-05-01", weightKg: 80 }]),
    ).toBeNull();
    expect(
      weightTrendEma([
        { dateKey: "2026-05-01", weightKg: 80 },
        { dateKey: "2026-05-01", weightKg: 79 },
        { dateKey: "not-a-day", weightKg: 78 },
        { dateKey: "2026-05-02", weightKg: 0 },
      ]),
    ).toBeNull();
  });
});

describe("clampGoalDelta", () => {
  it("limits one update to ten percent", () => {
    expect(clampGoalDelta(3000, 2000, 1500)).toBe(2200);
    expect(clampGoalDelta(1000, 2000, 1500)).toBe(1800);
  });

  it("never goes below BMR", () => {
    expect(clampGoalDelta(1000, 1600, 1550)).toBe(1550);
  });
});

/**
 * ВОРОТА ПОВНОТИ ДНЯ.
 *
 * Довго повнота міряласьa лічильником прийомів (`mealCount >= 3`), і це
 * промахувалось в обидва боки одночасно: три перекуси на 300 ккал
 * проходили як «повний день» (спіраль заниження, проти якої ворота й
 * ставили), а людина на двох прийомах за добу не набирала 10 повних днів
 * НІКОЛИ — тобто фіча для неї не вмикалась.
 *
 * Лічильник прийомів вимірює харчову звичку, а не повноту логу.
 */
describe("isDayFullyLogged", () => {
  it("три перекуси не є повним днем", () => {
    expect(isDayFullyLogged(300, 3, 2200)).toBe(false);
  });

  it("один великий прийом — повний день (OMAD/інтервальне)", () => {
    expect(isDayFullyLogged(2000, 1, 2200)).toBe(true);
  });

  it("день дефіциту лишається повним — ворота не судять дієту", () => {
    // 70% цілі: людина на дефіциті, і це чесний повний день.
    expect(isDayFullyLogged(1540, 3, 2200)).toBe(true);
  });

  it("нуль і відʼємне не проходять ніколи", () => {
    expect(isDayFullyLogged(0, 5, 2200)).toBe(false);
    expect(isDayFullyLogged(-10, 5, 2200)).toBe(false);
  });

  // До першого сіду цілі ще немає — краще груба евристика, ніж жодної.
  // Другий аргумент — ПРИЙОМИ, не рядки журналу: фото, збережене кількома
  // рядками одного прийому, не є кількома прийомами (аудит PR-N2). На боці
  // web це `loggedMealTypesCount`; його докстрінг забороняє брати `mealCount`.
  it("без цілі падає на лічильник прийомів", () => {
    expect(isDayFullyLogged(300, 3, null)).toBe(true);
    expect(isDayFullyLogged(300, 2, null)).toBe(false);
    expect(isDayFullyLogged(300, 3, 0)).toBe(true);
  });
});
