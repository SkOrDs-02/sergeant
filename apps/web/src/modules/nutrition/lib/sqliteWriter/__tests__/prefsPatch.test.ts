import { describe, it, expect } from "vitest";

import {
  buildPrefsOutboxRow,
  computePrefsPatch,
  isEmptyPrefsPatch,
} from "../diff.prefsPatch.js";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
  type NutritionPrefsSnapshot,
} from "../diff.js";

const base: NutritionPrefsSnapshot = {
  prefsJson: JSON.stringify({
    dailyTargetKcal: 2100,
    waterGoalMl: 2000,
    mealTemplates: [{ id: "t1" }],
  }),
  activePantryId: "p1",
};

function state(prefs: NutritionPrefsSnapshot | null): NutritionDualWriteState {
  return {
    meals: [],
    pantries: [],
    prefs,
    recipes: [],
    waterLog: {},
    shoppingList: null,
  };
}

describe("computePrefsPatch (data-04)", () => {
  it("лише змінені верхні ключі", () => {
    const next = {
      ...base,
      prefsJson: JSON.stringify({
        dailyTargetKcal: 2100,
        waterGoalMl: 2500,
        mealTemplates: [{ id: "t1" }],
      }),
    };
    const patch = computePrefsPatch(base, next);
    expect(patch?.keys).toEqual({ waterGoalMl: 2500 });
    expect(patch?.activePantryChanged).toBe(false);
  });

  it("масив шаблонів, що змінився, їде цілком", () => {
    const next = {
      ...base,
      prefsJson: JSON.stringify({
        dailyTargetKcal: 2100,
        waterGoalMl: 2000,
        mealTemplates: [{ id: "t1" }, { id: "t2" }],
      }),
    };
    expect(computePrefsPatch(base, next)?.keys).toEqual({
      mealTemplates: [{ id: "t1" }, { id: "t2" }],
    });
  });

  it("без prev (перше створення) -> повна заміна", () => {
    expect(computePrefsPatch(null, base)).toBeUndefined();
  });

  it("зниклий ключ -> повна заміна (патч не видаляє)", () => {
    const next = { ...base, prefsJson: '{"waterGoalMl":2000}' };
    expect(computePrefsPatch(base, next)).toBeUndefined();
  });

  it("нерозбірний JSON -> повна заміна", () => {
    expect(
      computePrefsPatch({ ...base, prefsJson: "{oops" }, base),
    ).toBeUndefined();
  });

  it("порожній патч розпізнається", () => {
    const reordered = {
      ...base,
      prefsJson: JSON.stringify({
        mealTemplates: [{ id: "t1" }],
        waterGoalMl: 2000,
        dailyTargetKcal: 2100,
      }),
    };
    const patch = computePrefsPatch(base, reordered);
    expect(patch && isEmptyPrefsPatch(patch)).toBe(true);
  });
});

describe("buildPrefsOutboxRow", () => {
  it("без патча: старий формат без prefs_merge (зворотна сумісність)", () => {
    expect(buildPrefsOutboxRow("u1", base)).toEqual({
      user_id: "u1",
      prefs_json: base.prefsJson,
      active_pantry_id: "p1",
    });
  });

  it("патч: prefs_merge, active_pantry_id лише коли змінився", () => {
    const row = buildPrefsOutboxRow("u1", base, {
      keys: { waterGoalMl: 2500 },
      activePantryChanged: false,
    });
    expect(row).toEqual({
      user_id: "u1",
      prefs_json: '{"waterGoalMl":2500}',
      prefs_merge: true,
    });
    expect("active_pantry_id" in row).toBe(false);
    const row2 = buildPrefsOutboxRow(
      "u1",
      { ...base, activePantryId: null },
      { keys: {}, activePantryChanged: true },
    );
    expect(row2.active_pantry_id).toBeNull();
  });
});

describe("diff: prefs-upsert з патчем", () => {
  it("зміна одного ключа дає op з patch", () => {
    const next = { ...base, prefsJson: base.prefsJson.replace("2000", "3000") };
    const ops = diffNutritionDualWriteOps(state(base), state(next)).filter(
      (o) => o.kind === "prefs-upsert",
    );
    expect(ops).toEqual([
      {
        kind: "prefs-upsert",
        prefs: next,
        patch: { keys: { waterGoalMl: 3000 }, activePantryChanged: false },
      },
    ]);
  });

  it("лише переупорядкований JSON -> жодного op (порожній патч не шлемо)", () => {
    const next = {
      ...base,
      prefsJson: JSON.stringify({
        waterGoalMl: 2000,
        mealTemplates: [{ id: "t1" }],
        dailyTargetKcal: 2100,
      }),
    };
    expect(diffNutritionDualWriteOps(state(base), state(next))).toEqual([]);
  });

  it("null -> prefs: op без patch (повна заміна)", () => {
    const ops = diffNutritionDualWriteOps(state(null), state(base)).filter(
      (o) => o.kind === "prefs-upsert",
    );
    expect(ops).toEqual([{ kind: "prefs-upsert", prefs: base }]);
  });
});
