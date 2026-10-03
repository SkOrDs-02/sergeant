const mockApplyNutritionDualWriteOps = jest.fn();
const mockSafeReadLS = jest.fn();
const mockSafeReadStringLS = jest.fn();
const mockSafeRemoveLS = jest.fn();

jest.mock("../sqliteWriter/adapter", () => ({
  applyNutritionDualWriteOps: (...args: unknown[]) =>
    mockApplyNutritionDualWriteOps(...args),
}));

jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeReadStringLS: (...args: unknown[]) => mockSafeReadStringLS(...args),
  safeRemoveLS: (...args: unknown[]) => mockSafeRemoveLS(...args),
}));

import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  SHOPPING_LIST_KEY,
  WATER_LOG_KEY,
} from "@sergeant/nutrition-domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { __testing, importNutritionResidualFromMmkv } from "../residualImport";

const allKeys = [
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_PREFS_KEY,
  WATER_LOG_KEY,
  SHOPPING_LIST_KEY,
  STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
];

describe("importNutritionResidualFromMmkv", () => {
  beforeEach(() => {
    mockApplyNutritionDualWriteOps.mockReset();
    mockSafeReadLS.mockReset();
    mockSafeReadStringLS.mockReset();
    mockSafeRemoveLS.mockReset();
  });

  it("no-ops when all legacy MMKV keys are absent", async () => {
    mockSafeReadLS.mockReturnValue(null);
    mockSafeReadStringLS.mockReturnValue(null);

    await expect(
      importNutritionResidualFromMmkv({} as never, "user-1"),
    ).resolves.toEqual({ imported: false, cleaned: false });

    expect(mockApplyNutritionDualWriteOps).not.toHaveBeenCalled();
    expect(mockSafeRemoveLS).not.toHaveBeenCalled();
  });

  it("imports readable legacy blobs with a stale timestamp and cleans keys", async () => {
    const mmkv = new Map<string, unknown>([
      [
        NUTRITION_LOG_KEY,
        {
          "2026-05-04": {
            meals: [
              {
                id: "meal-1",
                time: "08:00",
                mealType: "breakfast",
                name: "Омлет",
                label: "Омлет",
                macros: { kcal: 320, protein_g: 22 },
                source: "manual",
                macroSource: "manual",
                amount_g: 180,
                foodId: "food-1",
                demo: true,
              },
            ],
          },
        },
      ],
      [
        NUTRITION_PANTRIES_KEY,
        [
          {
            id: "pantry-1",
            name: "Дім",
            text: "",
            items: [{ name: "Рис", qty: 1, unit: "кг", notes: "басматі" }],
          },
        ],
      ],
      [NUTRITION_PREFS_KEY, { waterGoalMl: 2200 }],
      [WATER_LOG_KEY, { "2026-05-04": 500 }],
      [
        SHOPPING_LIST_KEY,
        {
          categories: [
            { name: "Овочі", items: [{ id: "i1", name: "Огірки" }] },
          ],
        },
      ],
      [
        STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
        {
          recipes: [
            {
              id: "recipe-1",
              title: "Салат",
              ingredients: ["огірки"],
              steps: ["нарізати"],
              macros: { kcal: 120 },
              createdAt: 10,
              updatedAt: 20,
            },
          ],
        },
      ],
    ]);
    mockSafeReadLS.mockImplementation((key: string) => mmkv.get(key) ?? null);
    mockSafeReadStringLS.mockImplementation((key: string) =>
      key === NUTRITION_ACTIVE_PANTRY_KEY ? "pantry-1" : null,
    );
    mockApplyNutritionDualWriteOps.mockResolvedValue({ applied: 1 });

    const client = { all: jest.fn() };
    await expect(
      importNutritionResidualFromMmkv(client as never, "user-1"),
    ).resolves.toEqual({ imported: true, cleaned: true });

    const [appliedClient, ops, options] =
      mockApplyNutritionDualWriteOps.mock.calls[0]!;
    expect(appliedClient).toBe(client);
    expect(ops).toEqual(expect.any(Array));
    expect(ops.length).toBeGreaterThan(0);
    expect(options).toMatchObject({
      userId: "user-1",
      clientTs: __testing.STALE_TIMESTAMP,
    });
    expect(mockSafeRemoveLS.mock.calls.map(([key]) => key)).toEqual(allKeys);
  });

  it("retains legacy keys when SQLite apply fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSafeReadLS.mockImplementation((key: string) =>
      key === WATER_LOG_KEY ? { "2026-05-04": 250 } : null,
    );
    mockSafeReadStringLS.mockReturnValue(null);
    mockApplyNutritionDualWriteOps.mockRejectedValue(new Error("disk full"));

    await expect(
      importNutritionResidualFromMmkv({} as never, "user-1"),
    ).resolves.toEqual({ imported: false, cleaned: false });

    expect(mockSafeRemoveLS).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[nutrition.residualImport] apply failed; MMKV keys retained",
      "disk full",
    );
    warn.mockRestore();
  });

  it("normalizes internal snapshot extractors defensively", () => {
    expect(
      __testing.extractMealSnapshots({
        "2026-05-04": {
          meals: [
            {
              id: "m1",
              name: "Meal",
              time: 123,
              mealType: undefined,
              macros: null,
            } as never,
            null as never,
          ],
        },
      }),
    ).toEqual([
      expect.objectContaining({
        id: "m1",
        dateKey: "2026-05-04",
        time: "",
        mealType: "snack",
        source: "manual",
        amountG: null,
      }),
    ]);

    expect(
      __testing.extractPantrySnapshots([
        {
          id: "p1",
          name: "Pantry",
          text: "",
          items: [{ name: "Rice", qty: "2" as never, unit: null, notes: null }],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "p1",
        items: [
          expect.objectContaining({
            id: "p1::0::Rice",
            qty: null,
          }),
        ],
      }),
    ]);

    expect(__testing.extractRecipesFromMmkvBlob({ nope: [] })).toEqual([]);
    expect(
      __testing.extractRecipeSnapshots(
        __testing.extractRecipesFromMmkvBlob([
          { id: "r1", title: "Recipe", createdAt: 1, updatedAt: 2 },
        ]),
      ),
    ).toEqual([
      expect.objectContaining({
        id: "r1",
        title: "Recipe",
        dataJson: expect.stringContaining("Recipe"),
      }),
    ]);
  });
});
