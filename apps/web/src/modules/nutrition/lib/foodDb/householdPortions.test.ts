/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Тест на корпус побутових порцій (OD-27 Х-1 а): кожна позиція існує в
 * корпусі, кожна одиниця має вагу в правдоподібних межах свого виду, назви
 * одиниць узгоджені з числом (1, 2–4, 5+, дріб).
 */
import { describe, expect, it } from "vitest";
import { GENERIC_FOODS } from "@sergeant/shared/data/genericFoods";
import {
  HOUSEHOLD_PORTIONS,
  HOUSEHOLD_UNITS,
  householdServingFor,
  withHouseholdServing,
  type HouseholdUnitKey,
} from "./householdPortions";
import { portionQtyLabel } from "../../components/meal-sheet/portionUnits";

/**
 * Межі ваги однієї одиниці, г. Не довідник, а сітка проти друкарської
 * помилки: «скибка 300» для хліба ловиться окремо (межі за категорією
 * корпусу нижче), «склянка 25» — тут.
 */
const UNIT_BOUNDS: Record<HouseholdUnitKey, readonly [number, number]> = {
  slice: [8, 300],
  piece: [5, 400],
  glass: [120, 260],
  cup: [150, 350],
  can: [250, 500],
  bottle: [330, 1000],
  wineglass: [100, 200],
  shot: [30, 60],
  tbsp: [10, 25],
  tsp: [3, 10],
  scoop: [25, 40],
  handful: [20, 40],
  pack: [150, 250],
  pot: [70, 200],
  bowl: [250, 400],
  wedge: [80, 200],
  bit: [20, 40],
  bar: [20, 70],
  tablet: [80, 100],
  ball: [100, 150],
  half: [50, 150],
  egg: [8, 60],
  clove: [3, 8],
  cob: [80, 150],
  apple: [120, 200],
  pear: [120, 200],
  banana: [100, 140],
  orange: [110, 160],
  tangerine: [50, 100],
  peach: [110, 180],
  potato: [100, 200],
  tomato: [90, 160],
  cucumber: [90, 160],
  carrot: [50, 100],
  onion: [70, 130],
  pepper: [90, 160],
  sausage: [35, 70],
  wiener: [70, 120],
  patty: [60, 200],
  dumpling: [15, 40],
  pelmen: [8, 20],
  pancake: [30, 70],
  crepe: [60, 100],
  syrnyk: [35, 70],
  derun: [40, 90],
  cabbageRoll: [80, 160],
  drumstick: [50, 100],
};

/** Стеля одиниці за категорією корпусу: «скибка хліба» не важить як кавун. */
const CATEGORY_MAX: Record<string, number> = {
  "Хліб і випічка": 80,
  "Соуси і спеції": 25,
  "Олії і жири": 15,
  "Горіхи і насіння": 40,
  "Спортивне харчування": 40,
  Яйця: 60,
};

const bySlug = new Map(GENERIC_FOODS.map((f) => [f.slug, f]));

describe("HOUSEHOLD_PORTIONS: корпус", () => {
  it("близько ста позицій, кожна є в корпусі базової їжі", () => {
    const slugs = Object.keys(HOUSEHOLD_PORTIONS);
    expect(slugs.length).toBeGreaterThanOrEqual(100);
    expect(slugs.filter((s) => !bySlug.has(s))).toEqual([]);
  });

  it("жодна одиниця без ваги, вага в межах свого виду і категорії", () => {
    const bad: string[] = [];
    for (const [slug, entry] of Object.entries(HOUSEHOLD_PORTIONS)) {
      if (typeof entry === "number") {
        if (!(entry > 0 && entry <= 500)) bad.push(`${slug}: ${entry}`);
        continue;
      }
      expect(entry.length, slug).toBeGreaterThanOrEqual(1);
      expect(entry.length, slug).toBeLessThanOrEqual(2);
      for (const [key, grams] of entry) {
        const [min, max] = UNIT_BOUNDS[key];
        const catMax = CATEGORY_MAX[bySlug.get(slug)?.category ?? ""];
        if (!(Number.isFinite(grams) && grams >= min && grams <= max))
          bad.push(`${slug}/${key}: ${grams} поза [${min}, ${max}]`);
        if (catMax != null && grams > catMax)
          bad.push(`${slug}/${key}: ${grams} > ${catMax} для категорії`);
      }
      const keys = entry.map(([k]) => k);
      expect(new Set(keys).size, slug).toBe(keys.length);
    }
    expect(bad).toEqual([]);
  });

  it("кожна одиниця має чотири непорожні форми, і 1 ≠ 5+", () => {
    for (const [key, forms] of Object.entries(HOUSEHOLD_UNITS)) {
      expect(forms, key).toHaveLength(4);
      for (const form of forms)
        expect(form.trim().length, key).toBeGreaterThan(0);
      expect(forms[0], key).not.toBe(forms[2]);
      // Влазить у межу назви власної порції (`PORTION_NAME_MAX_LEN`).
      expect(forms[0].length, key).toBeLessThanOrEqual(24);
    }
  });
});

describe("portionQtyLabel: узгодження з числом", () => {
  const egg = householdServingFor("gen_iaitse-kuriache")!.portions[0]!;
  const slice = householdServingFor("gen_khlib-zhytnii")!.portions[0]!;
  const banana = householdServingFor("gen_banan")!.portions[0]!;

  it.each([
    [1, "яйце"],
    [2, "яйця"],
    [4, "яйця"],
    [5, "яєць"],
    [11, "яєць"],
    [21, "яйце"],
    [22, "яйця"],
    [0.5, "яйця"],
    [1.5, "яйця"],
  ])("яйце × %s → %s", (qty, label) => {
    expect(portionQtyLabel(egg, qty)).toBe(label);
  });

  it("скибка і банан: дріб бере родовий відмінок однини", () => {
    expect(portionQtyLabel(slice, 2)).toBe("скибки");
    expect(portionQtyLabel(slice, 5)).toBe("скибок");
    expect(portionQtyLabel(banana, 2)).toBe("середні банани");
    expect(portionQtyLabel(banana, 1.5)).toBe("середнього банана");
  });

  it("власна порція без форм лишається своєю назвою", () => {
    expect(portionQtyLabel({ id: "p1", name: "скибка", grams: 30 }, 3)).toBe(
      "скибка",
    );
  });
});

describe("householdServingFor / withHouseholdServing", () => {
  it("штучна позиція: перша одиниця і є типовою вагою", () => {
    const s = householdServingFor("gen_iaitse-kuriache");
    expect(s?.defaultGrams).toBe(50);
    expect(s?.portions).toEqual([
      expect.objectContaining({ id: "hh_egg", name: "яйце", grams: 50 }),
    ]);
  });

  it("позиція без одиниці дає лише типову вагу", () => {
    expect(householdServingFor("gen_hrechka-varena")).toEqual({
      defaultGrams: 150,
      portions: [],
    });
  });

  it("не базовий продукт або позиції немає в таблиці — null", () => {
    expect(householdServingFor("food_123")).toBeNull();
    expect(householdServingFor("gen_kvasolia-sukha")).toBeNull();
    expect(householdServingFor(undefined)).toBeNull();
  });

  it("накладає порцію на хіт, але не підмінює власних порцій людини", () => {
    const hit = { id: "gen_banan", defaultGrams: 100, name: "Банан" };
    expect(withHouseholdServing(hit)).toMatchObject({
      defaultGrams: 120,
      portions: [expect.objectContaining({ id: "hh_banana", grams: 120 })],
    });
    const own = {
      id: "gen_banan",
      defaultGrams: 100,
      portions: [{ id: "p1", name: "мій", grams: 90 }],
    };
    expect(withHouseholdServing(own)).toBe(own);
    const other = { id: "off_1", defaultGrams: 100 };
    expect(withHouseholdServing(other)).toBe(other);
  });
});
