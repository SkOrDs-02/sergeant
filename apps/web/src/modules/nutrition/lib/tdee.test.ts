/**
 * Unit tests for the Mifflin-St Jeor TDEE helpers behind
 * "Розрахувати з профілю" (PR #2 of the biometrics roll-out).
 *
 * The pure layer here is what we want to lock down — once these
 * numbers hold, `DailyPlanCard` just plumbs them into `setPrefs`.
 */
import { describe, expect, it } from "vitest";

import type { Biometrics } from "../../../core/profile/biometrics";
import {
  ACTIVITY_MULTIPLIERS,
  GOAL_KCAL_DELTA,
  computeNutritionTargets,
  computeNutritionTargetsFromBiometrics,
  computeTdee,
  mifflinStJeorBmr,
} from "./tdee";

describe("mifflinStJeorBmr", () => {
  it("matches the published Mifflin-St Jeor numbers for males", () => {
    // 30y, 80kg, 180cm man → 10·80 + 6.25·180 − 5·30 + 5 = 1780.
    expect(
      mifflinStJeorBmr({
        weightKg: 80,
        heightCm: 180,
        ageYears: 30,
        sex: "male",
      }),
    ).toBe(1780);
  });

  it("matches the published Mifflin-St Jeor numbers for females", () => {
    // 30y, 65kg, 168cm woman → 10·65 + 6.25·168 − 5·30 − 161 = 1389.
    expect(
      mifflinStJeorBmr({
        weightKg: 65,
        heightCm: 168,
        ageYears: 30,
        sex: "female",
      }),
    ).toBe(1389);
  });
});

describe("computeTdee", () => {
  it("multiplies BMR by the requested activity tier", () => {
    const tdee = computeTdee({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      sex: "male",
      activityLevel: "moderate",
    });
    // 1780 · 1.55 = 2759.
    expect(tdee).toBeCloseTo(1780 * ACTIVITY_MULTIPLIERS.moderate, 5);
  });

  it("scales linearly with the activity ladder", () => {
    const base = computeTdee({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      sex: "male",
      activityLevel: "sedentary",
    });
    const top = computeTdee({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      sex: "male",
      activityLevel: "very_active",
    });
    expect(top / base).toBeCloseTo(
      ACTIVITY_MULTIPLIERS.very_active / ACTIVITY_MULTIPLIERS.sedentary,
      5,
    );
  });
});

describe("computeNutritionTargets", () => {
  const baseInput = {
    weightKg: 80,
    heightCm: 180,
    ageYears: 30,
    sex: "male" as const,
    activityLevel: "moderate" as const,
  };

  it("rounds kcal to the nearest 10 after applying the goal delta", () => {
    // BMR 1780 · 1.55 ≈ 2759 → maintenance 2760, cut 2260, bulk 3060.
    expect(computeNutritionTargets(baseInput, "maintenance").kcal).toBe(2760);
    expect(computeNutritionTargets(baseInput, "cutting").kcal).toBe(2260);
    expect(computeNutritionTargets(baseInput, "bulking").kcal).toBe(3060);
  });

  it("applies per-goal protein/fat g/kg and fills carbs from the remainder", () => {
    const cutting = computeNutritionTargets(baseInput, "cutting");
    // 2.0 g/kg protein, 0.8 g/kg fat at 80kg → 160P / 64F.
    expect(cutting.protein_g).toBe(160);
    expect(cutting.fat_g).toBe(64);

    const maintenance = computeNutritionTargets(baseInput, "maintenance");
    expect(maintenance.protein_g).toBe(128);
    expect(maintenance.fat_g).toBe(80);

    const bulking = computeNutritionTargets(baseInput, "bulking");
    expect(bulking.protein_g).toBe(144);
    expect(bulking.fat_g).toBe(80);
  });

  it("keeps macro kcal close to the kcal target (within a 1 g rounding error)", () => {
    for (const goal of ["cutting", "maintenance", "bulking"] as const) {
      const t = computeNutritionTargets(baseInput, goal);
      const macroKcal = t.protein_g * 4 + t.fat_g * 9 + t.carbs_g * 4;
      expect(Math.abs(macroKcal - t.kcal)).toBeLessThan(5);
    }
  });

  it("clamps the kcal floor so a deep cut does not land below 1000", () => {
    // Petite female on a sedentary day → BMR ≈ 1024, TDEE ≈ 1229,
    // cutting (-500) would be 729 raw → clamp at 1000.
    const tiny = computeNutritionTargets(
      {
        weightKg: 45,
        heightCm: 155,
        ageYears: 35,
        sex: "female",
        activityLevel: "sedentary",
      },
      "cutting",
    );
    expect(tiny.kcal).toBeGreaterThanOrEqual(1000);
  });

  it("uses the documented per-goal kcal deltas", () => {
    // Sanity-check the public delta table — protects against a stray
    // edit reordering the constants.
    expect(GOAL_KCAL_DELTA.cutting).toBe(-500);
    expect(GOAL_KCAL_DELTA.maintenance).toBe(0);
    expect(GOAL_KCAL_DELTA.bulking).toBe(300);
  });
});

describe("computeNutritionTargetsFromBiometrics", () => {
  function fullBiometrics(patch: Partial<Biometrics> = {}): Biometrics {
    return {
      heightCm: 180,
      birthDate: "1995-01-15",
      sex: "male",
      activityLevel: "moderate",
      weightKg: 80,
      weightUpdatedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...patch,
    };
  }

  it("returns null when any required field is missing", () => {
    const fields: Array<keyof Biometrics> = [
      "heightCm",
      "birthDate",
      "sex",
      "activityLevel",
      "weightKg",
    ];
    for (const field of fields) {
      const bio = fullBiometrics({ [field]: null } as Partial<Biometrics>);
      expect(
        computeNutritionTargetsFromBiometrics(bio, "maintenance"),
      ).toBeNull();
    }
  });

  it("derives age from birthDate against the supplied `now`", () => {
    const bio = fullBiometrics({ birthDate: "1995-01-15" });
    const now = new Date("2026-01-15T12:00:00Z"); // exactly 31.
    const t = computeNutritionTargetsFromBiometrics(bio, "maintenance", now);
    expect(t).not.toBeNull();
    // 10·80 + 6.25·180 − 5·31 + 5 = 1775 → ·1.55 = 2751.25 → round 2750.
    expect(t!.kcal).toBe(2750);
  });

  it("returns valid targets when biometrics is complete", () => {
    const t = computeNutritionTargetsFromBiometrics(
      fullBiometrics(),
      "maintenance",
      new Date("2026-01-14T00:00:00Z"),
    );
    expect(t).not.toBeNull();
    expect(t!.kcal).toBeGreaterThan(0);
    expect(t!.protein_g).toBeGreaterThan(0);
    expect(t!.fat_g).toBeGreaterThan(0);
    expect(t!.carbs_g).toBeGreaterThanOrEqual(0);
  });

  // ── W1-WEIGHT-SOT стадія 1: вага з fizruk-SoT з фолбеком на біометрію ──
  describe("fizruk-вага як джерело SoT", () => {
    const NOW = new Date("2026-01-15T12:00:00Z"); // рівно 31 рік.

    it("надає перевагу fizruk-вазі над знімком біометрії", () => {
      const bio = fullBiometrics({ weightKg: 80 });
      const fromFizruk = computeNutritionTargetsFromBiometrics(
        bio,
        "maintenance",
        NOW,
        90,
      );
      const asIfBiometrics = computeNutritionTargetsFromBiometrics(
        fullBiometrics({ weightKg: 90 }),
        "maintenance",
        NOW,
      );
      expect(fromFizruk).toEqual(asIfBiometrics);
      expect(fromFizruk!.kcal).not.toBe(
        computeNutritionTargetsFromBiometrics(bio, "maintenance", NOW)!.kcal,
      );
    });

    it("падає назад на biometrics.weightKg, коли fizruk порожній", () => {
      const bio = fullBiometrics({ weightKg: 80 });
      const base = computeNutritionTargetsFromBiometrics(
        bio,
        "maintenance",
        NOW,
      );
      expect(
        computeNutritionTargetsFromBiometrics(bio, "maintenance", NOW, null),
      ).toEqual(base);
      expect(
        computeNutritionTargetsFromBiometrics(
          bio,
          "maintenance",
          NOW,
          undefined,
        ),
      ).toEqual(base);
    });

    it("ігнорує сміттєву fizruk-вагу (0, відʼємна, NaN)", () => {
      const bio = fullBiometrics({ weightKg: 80 });
      const base = computeNutritionTargetsFromBiometrics(
        bio,
        "maintenance",
        NOW,
      );
      for (const bad of [0, -5, Number.NaN]) {
        expect(
          computeNutritionTargetsFromBiometrics(bio, "maintenance", NOW, bad),
        ).toEqual(base);
      }
    });

    it("рятує юзера без ваги в біометрії, якщо fizruk-вага є", () => {
      const bio = fullBiometrics({ weightKg: null });
      expect(
        computeNutritionTargetsFromBiometrics(bio, "maintenance", NOW),
      ).toBeNull();
      const t = computeNutritionTargetsFromBiometrics(
        bio,
        "maintenance",
        NOW,
        82,
      );
      expect(t).not.toBeNull();
      expect(t!.kcal).toBeGreaterThan(0);
    });
  });
});
