// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the boot-time residual LS → SQLite import helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readJSON = vi.fn();
const readRaw = vi.fn();
const removeItem = vi.fn();
vi.mock("./nutritionStorageInstance", () => ({
  nutritionStorage: {
    readJSON: (...a: unknown[]) => readJSON(...a),
    readRaw: (...a: unknown[]) => readRaw(...a),
    removeItem: (...a: unknown[]) => removeItem(...a),
  },
}));

const applyOps = vi.fn();
vi.mock("./dualWrite/adapter.js", () => ({
  applyNutritionDualWriteOps: (...a: unknown[]) => applyOps(...a),
}));

const diffOps = vi.fn();
vi.mock("./dualWrite/diff.js", () => ({
  diffNutritionDualWriteOps: (...a: unknown[]) => diffOps(...a),
}));

vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { __testing, importNutritionResidualFromLs } from "./residualImport";

const client = {} as never;

beforeEach(() => {
  readJSON.mockReset().mockReturnValue(null);
  readRaw.mockReset().mockReturnValue(null);
  removeItem.mockReset();
  applyOps.mockReset().mockResolvedValue(undefined);
  diffOps.mockReset().mockReturnValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("importNutritionResidualFromLs", () => {
  it("no-ops when no LS keys are present", async () => {
    const res = await importNutritionResidualFromLs(client, "user-1");
    expect(res).toEqual({ imported: false, cleaned: false });
    expect(applyOps).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("imports ops and clears LS when data is present", async () => {
    // log present → hasAny true
    readJSON.mockImplementation((key: string) =>
      key.includes("log") ? { "2026-06-23": { meals: [] } } : null,
    );
    diffOps.mockReturnValue([{ op: "upsertMeal" }]);

    const res = await importNutritionResidualFromLs(client, "user-1");

    expect(applyOps).toHaveBeenCalledWith(
      client,
      [{ op: "upsertMeal" }],
      expect.objectContaining({
        userId: "user-1",
        clientTs: __testing.STALE_TIMESTAMP,
      }),
    );
    expect(removeItem).toHaveBeenCalledTimes(4);
    expect(res).toEqual({ imported: true, cleaned: true });
  });

  it("cleans LS even when there are zero ops to apply", async () => {
    readRaw.mockReturnValue("pantry-active-id"); // activePantryId present
    diffOps.mockReturnValue([]);

    const res = await importNutritionResidualFromLs(client, "user-1");
    expect(applyOps).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledTimes(4);
    expect(res).toEqual({ imported: false, cleaned: true });
  });

  it("retains LS keys when apply throws", async () => {
    readJSON.mockImplementation((key: string) =>
      key.includes("log") ? { d: { meals: [] } } : null,
    );
    diffOps.mockReturnValue([{ op: "x" }]);
    applyOps.mockRejectedValue(new Error("db down"));

    const res = await importNutritionResidualFromLs(client, "user-1");
    expect(res).toEqual({ imported: false, cleaned: false });
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("tolerates LS readers that throw (collapses to null)", async () => {
    readJSON.mockImplementation(() => {
      throw new Error("blocked");
    });
    readRaw.mockImplementation(() => {
      throw new Error("blocked");
    });
    const res = await importNutritionResidualFromLs(client, "user-1");
    expect(res).toEqual({ imported: false, cleaned: false });
  });
});

describe("__testing.extractMealSnapshots", () => {
  it("flattens day → meals into snapshots and drops invalid entries", () => {
    const log = {
      "2026-06-23": {
        meals: [
          {
            id: "m1",
            time: "12:00",
            mealType: "lunch",
            name: "Борщ",
            macros: { kcal: 300 },
            amount_g: 250,
            foodId: "f1",
            demo: true,
          },
          null,
          { name: "no id" },
        ],
      },
    } as never;
    const out = __testing.extractMealSnapshots(log);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "m1",
      dateKey: "2026-06-23",
      mealType: "lunch",
      name: "Борщ",
      amountG: 250,
      foodId: "f1",
      isDemo: true,
    });
  });

  it("defaults missing fields", () => {
    const log = {
      day1: { meals: [{ id: "m2" }] },
    } as never;
    const out = __testing.extractMealSnapshots(log);
    expect(out[0]).toMatchObject({
      mealType: "snack",
      source: "manual",
      macroSource: "manual",
      amountG: null,
      foodId: null,
      isDemo: false,
    });
  });
});

describe("__testing.extractPantrySnapshots", () => {
  it("maps pantries and synthesizes item ids", () => {
    const out = __testing.extractPantrySnapshots([
      {
        id: "p1",
        name: "Холодильник",
        text: "raw",
        items: [{ name: "Молоко", qty: 1, unit: "л", notes: "свіже" }],
      },
    ] as never);
    expect(out[0]?.id).toBe("p1");
    expect(out[0]?.items[0]).toMatchObject({
      id: "p1::0::Молоко",
      name: "Молоко",
      qty: 1,
      unit: "л",
      notes: "свіже",
    });
  });

  it("nulls invalid qty/unit/notes and tolerates missing items", () => {
    const out = __testing.extractPantrySnapshots([
      { id: "p2", name: "X", text: "", items: undefined },
    ] as never);
    expect(out[0]?.items).toEqual([]);
  });
});
