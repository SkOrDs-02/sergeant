// defaultNutritionPrefs + normalizeNutritionPrefs: парсинг довільного JSON-вводу
// (legacy LS / RN MMKV) у валідні NutritionPrefs.
import { describe, expect, it } from "vitest";

import {
  defaultNutritionPrefs,
  normalizeNutritionPrefs,
} from "./nutritionPrefs.js";

describe("defaultNutritionPrefs", () => {
  it("повертає стабільний дефолт (зміни = міграція)", () => {
    expect(defaultNutritionPrefs()).toEqual({
      goal: "balanced",
      servings: 1,
      timeMinutes: 25,
      exclude: "",
      recipeMealType: "any",
      recipePantryMode: "prefer",
      dailyTargetKcal: null,
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
      mealTemplates: [],
      reminderEnabled: false,
      reminderHour: 12,
      waterGoalMl: 2000,
      weeklyRateKg: 0.5,
      goalWeightKg: null,
      adaptiveGoalEnabled: true,
      adaptiveGoalIntent: "maintenance",
      adaptiveGoalLastUpdatedAt: null,
      // Додано 2026-09-13 разом зі знімком підстави зміни цілі. Міграції
      // НЕ потребує, і саме це варто зафіксувати: prefs зберігаються як
      // JSON-блоб, а `normalizeNutritionPrefs` віддає `null` для
      // відсутнього ключа — тож старі записи читаються без дотику.
      adaptiveGoalLastReason: null,
    });
  });

  it("кожен виклик дає новий обʼєкт", () => {
    const a = defaultNutritionPrefs();
    const b = defaultNutritionPrefs();
    expect(a).not.toBe(b);
    a.mealTemplates.push({
      id: "x",
      name: "y",
      mealType: "snack",
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
    });
    expect(b.mealTemplates).toEqual([]);
  });

  it("нормалізує адаптивну ціль і не пропускає невідомі значення", () => {
    expect(
      normalizeNutritionPrefs({
        adaptiveGoalEnabled: false,
        adaptiveGoalIntent: "cutting",
        adaptiveGoalLastUpdatedAt: "2026-09-08T10:00:00.000Z",
      }),
    ).toMatchObject({
      adaptiveGoalEnabled: false,
      adaptiveGoalIntent: "cutting",
      adaptiveGoalLastUpdatedAt: "2026-09-08T10:00:00.000Z",
    });

    expect(
      normalizeNutritionPrefs({
        dailyTargetKcal: 2100,
        adaptiveGoalIntent: "unknown",
        adaptiveGoalLastUpdatedAt: 123,
      }),
    ).toMatchObject({
      adaptiveGoalEnabled: false,
      adaptiveGoalIntent: "maintenance",
      adaptiveGoalLastUpdatedAt: null,
    });
  });
});

describe("normalizeNutritionPrefs", () => {
  describe("invalid input → defaults", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["array", []],
      ["string", "garbage"],
      ["number", 42],
    ])("повертає defaults для %s", (_label, input) => {
      expect(normalizeNutritionPrefs(input)).toEqual(defaultNutritionPrefs());
    });
  });

  describe("scalar coercion", () => {
    it("servings: NaN/0/null → 1", () => {
      expect(normalizeNutritionPrefs({ servings: "garbage" }).servings).toBe(1);
      expect(normalizeNutritionPrefs({ servings: 0 }).servings).toBe(1);
      expect(normalizeNutritionPrefs({ servings: null }).servings).toBe(1);
    });

    it("servings: позитивне число лишається", () => {
      expect(normalizeNutritionPrefs({ servings: 4 }).servings).toBe(4);
    });

    it("timeMinutes: NaN → 25 (default)", () => {
      expect(
        normalizeNutritionPrefs({ timeMinutes: "garbage" }).timeMinutes,
      ).toBe(25);
      expect(normalizeNutritionPrefs({ timeMinutes: 0 }).timeMinutes).toBe(25);
      expect(normalizeNutritionPrefs({ timeMinutes: 60 }).timeMinutes).toBe(60);
    });

    it("exclude: null → '', інше → String", () => {
      expect(normalizeNutritionPrefs({ exclude: null }).exclude).toBe("");
      expect(normalizeNutritionPrefs({ exclude: 42 }).exclude).toBe("42");
    });

    it("goal: falsy → 'balanced'", () => {
      expect(normalizeNutritionPrefs({ goal: "" }).goal).toBe("balanced");
      expect(normalizeNutritionPrefs({ goal: 0 }).goal).toBe("balanced");
      expect(normalizeNutritionPrefs({ goal: "loss" }).goal).toBe("loss");
    });

    it("dailyTarget*: <=0 / NaN → null; >0 → значення", () => {
      const out = normalizeNutritionPrefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: -10, // negative → null
        dailyTargetFat_g: "abc", // NaN → null
        dailyTargetCarbs_g: 0, // 0 не позитивне → null
      });
      expect(out.dailyTargetKcal).toBe(2000);
      expect(out.dailyTargetProtein_g).toBeNull();
      expect(out.dailyTargetFat_g).toBeNull();
      expect(out.dailyTargetCarbs_g).toBeNull();
    });

    it("reminderEnabled: завжди Boolean()", () => {
      expect(
        normalizeNutritionPrefs({ reminderEnabled: 1 }).reminderEnabled,
      ).toBe(true);
      expect(
        normalizeNutritionPrefs({ reminderEnabled: 0 }).reminderEnabled,
      ).toBe(false);
      expect(
        normalizeNutritionPrefs({ reminderEnabled: "yes" }).reminderEnabled,
      ).toBe(true);
    });

    it("reminderHour: clamp у [0, 23] + floor", () => {
      expect(normalizeNutritionPrefs({ reminderHour: 7.9 }).reminderHour).toBe(
        7,
      );
      expect(normalizeNutritionPrefs({ reminderHour: -5 }).reminderHour).toBe(
        0,
      );
      expect(normalizeNutritionPrefs({ reminderHour: 99 }).reminderHour).toBe(
        23,
      );
      expect(
        normalizeNutritionPrefs({ reminderHour: "garbage" }).reminderHour,
      ).toBe(12); // default
    });

    it("waterGoalMl: <=0 / NaN → дефолт 2000; позитивне зберігається", () => {
      expect(normalizeNutritionPrefs({ waterGoalMl: 0 }).waterGoalMl).toBe(
        2000,
      );
      expect(normalizeNutritionPrefs({ waterGoalMl: -100 }).waterGoalMl).toBe(
        2000,
      );
      expect(
        normalizeNutritionPrefs({ waterGoalMl: "garbage" }).waterGoalMl,
      ).toBe(2000);
      expect(normalizeNutritionPrefs({ waterGoalMl: 2500 }).waterGoalMl).toBe(
        2500,
      );
    });
  });

  describe("mealTemplates", () => {
    it("не масив → []", () => {
      expect(
        normalizeNutritionPrefs({ mealTemplates: "garbage" }).mealTemplates,
      ).toEqual([]);
    });

    it("обрізає до 40 шаблонів (slice 0..40)", () => {
      const tpls = Array.from({ length: 50 }, (_, i) => ({
        id: `t${i}`,
        name: `Тплт ${i}`,
        mealType: "snack",
      }));
      expect(
        normalizeNutritionPrefs({ mealTemplates: tpls }).mealTemplates,
      ).toHaveLength(40);
    });

    it("відкидає шаблон без name (після trim) і non-object", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [
          { id: "t1", name: "  Сніданок  ", mealType: "breakfast" },
          { id: "t2", name: "", mealType: "lunch" }, // пустий name → drop
          { id: "t3", name: "   ", mealType: "snack" }, // тільки whitespace → drop
          "garbage",
          null,
        ],
      });
      expect(out.mealTemplates).toHaveLength(1);
      expect(out.mealTemplates[0]!.name).toBe("Сніданок");
      expect(out.mealTemplates[0]!.mealType).toBe("breakfast");
    });

    it("невалідний mealType → fallback 'snack'", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [{ id: "t1", name: "Х", mealType: "wrong" }],
      });
      expect(out.mealTemplates[0]!.mealType).toBe("snack");
    });

    it("шаблон без id → синтетичний tpl_<ts>", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [{ name: "Х", mealType: "lunch" }],
      });
      expect(out.mealTemplates[0]!.id).toMatch(/^tpl_\d+$/);
    });

    it("macros нормалізується через @sergeant/shared (negative → null)", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [
          {
            id: "t1",
            name: "Х",
            mealType: "lunch",
            macros: { kcal: 500, protein_g: -10, fat_g: "abc", carbs_g: 50 },
          },
        ],
      });
      expect(out.mealTemplates[0]!.macros).toEqual({
        kcal: 500,
        protein_g: null, // <0
        fat_g: null, // NaN
        carbs_g: 50,
      });
    });
  });
});

/**
 * Знімок підстави зміни цілі (`adaptiveGoalLastReason`).
 *
 * Половина знімка гірша за його відсутність: картка показала б «витрата
 * ≈NaN» замість того, щоб змовчати. Тому нормалізація — усе або нічого.
 */
describe("adaptiveGoalLastReason", () => {
  it("старі prefs без ключа читаються без міграції", () => {
    const legacy = {
      goal: "balanced",
      adaptiveGoalEnabled: true,
      adaptiveGoalLastUpdatedAt: "2026-09-01T10:00:00.000Z",
    };
    expect(normalizeNutritionPrefs(legacy).adaptiveGoalLastReason).toBeNull();
    expect(normalizeNutritionPrefs(legacy).adaptiveGoalLastUpdatedAt).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("повний знімок проходить як є", () => {
    const reason = {
      averageIntakeKcal: 2180,
      weightDeltaKg: -0.4,
      tdeeKcal: 2400,
      goalKcal: 2275,
    };
    expect(
      normalizeNutritionPrefs({ adaptiveGoalLastReason: reason })
        .adaptiveGoalLastReason,
    ).toEqual(reason);
  });

  /**
   * НЕ `Number(...)`, а `typeof`.
   *
   * Тут була діра рівно в тому правилі, заради якого функція й існує:
   * `Number(null)`, `Number("")`, `Number(false)`, `Number([])` — усе це
   * 0, тож знімок із суцільних `null` ставав валідною «нульовою
   * підставою», а булеві давали ще й `weightDeltaKg: 1` — вигаданий тренд
   * «+1,0 кг». Людині показали б упевнене пояснення зміни цілі, зіткане з
   * нічого.
   *
   * Перший набір тестів цього не спіймав, бо перевіряв `NaN` і неповні
   * обʼєкти — тобто форми, де коерція й так падає. Саме всі-`null` і
   * булеві проходили наскрізь.
   */
  it("значення, які коерція перетворила б на нулі, відкидаються", () => {
    const shapes = [
      {
        averageIntakeKcal: null,
        weightDeltaKg: null,
        tdeeKcal: null,
        goalKcal: null,
      },
      { averageIntakeKcal: "", weightDeltaKg: "", tdeeKcal: "", goalKcal: "" },
      {
        averageIntakeKcal: false,
        weightDeltaKg: true,
        tdeeKcal: false,
        goalKcal: false,
      },
      { averageIntakeKcal: [], weightDeltaKg: [], tdeeKcal: [], goalKcal: [] },
      // Рядок-число теж не проходить: знімок пише наш код через
      // `JSON.stringify`, тож рядок означає пошкоджені дані.
      {
        averageIntakeKcal: "2180",
        weightDeltaKg: "-0.4",
        tdeeKcal: "2400",
        goalKcal: "2275",
      },
    ];
    for (const bad of shapes) {
      expect(
        normalizeNutritionPrefs({ adaptiveGoalLastReason: bad })
          .adaptiveGoalLastReason,
      ).toBeNull();
    }
  });

  it("неповний або зіпсований знімок відкидається цілком", () => {
    for (const bad of [
      { averageIntakeKcal: 2180 },
      { averageIntakeKcal: 2180, weightDeltaKg: -0.4, tdeeKcal: 2400 },
      {
        averageIntakeKcal: "багато",
        weightDeltaKg: -0.4,
        tdeeKcal: 2400,
        goalKcal: 2275,
      },
      { averageIntakeKcal: NaN, weightDeltaKg: 0, tdeeKcal: 0, goalKcal: 0 },
      [],
      "reason",
    ]) {
      expect(
        normalizeNutritionPrefs({ adaptiveGoalLastReason: bad })
          .adaptiveGoalLastReason,
      ).toBeNull();
    }
  });

  // Нуль — валідне значення (тренд ваги рівно нульовий), і відкидати його
  // разом зі сміттям було б помилкою: `Number.isFinite(0)` істинне.
  it("нульова дельта ваги лишається знімком", () => {
    const reason = {
      averageIntakeKcal: 2180,
      weightDeltaKg: 0,
      tdeeKcal: 2400,
      goalKcal: 2275,
    };
    expect(
      normalizeNutritionPrefs({ adaptiveGoalLastReason: reason })
        .adaptiveGoalLastReason,
    ).toEqual(reason);
  });

  it("weeklyRateKg поза allowlist-ом нормалізується в 0.5, дозволені лишаються", () => {
    expect(normalizeNutritionPrefs({ weeklyRateKg: 1 }).weeklyRateKg).toBe(0.5);
    expect(normalizeNutritionPrefs({ weeklyRateKg: "x" }).weeklyRateKg).toBe(
      0.5,
    );
    expect(normalizeNutritionPrefs({ weeklyRateKg: 0.25 }).weeklyRateKg).toBe(
      0.25,
    );
    expect(normalizeNutritionPrefs({ weeklyRateKg: 0.75 }).weeklyRateKg).toBe(
      0.75,
    );
  });

  it("goalWeightKg поза діапазоном ваги → null", () => {
    expect(
      normalizeNutritionPrefs({ goalWeightKg: 5 }).goalWeightKg,
    ).toBeNull();
    expect(
      normalizeNutritionPrefs({ goalWeightKg: 500 }).goalWeightKg,
    ).toBeNull();
    expect(normalizeNutritionPrefs({ goalWeightKg: 75 }).goalWeightKg).toBe(75);
  });
});
