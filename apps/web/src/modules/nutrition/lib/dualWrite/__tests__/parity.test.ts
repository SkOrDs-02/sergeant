import { describe, expect, it } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  NutritionDualWriteState,
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionPrefsSnapshot,
  NutritionRecipeSnapshot,
} from "../diff.js";
import { probeNutritionParity } from "../parity.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";
const TS = "2026-05-08T10:00:00.000Z";

const EMPTY_STATE: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
};

async function seedMeal(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_meals
       (id, user_id, eaten_at, meal_type, name, label,
        kcal, protein_g, fat_g, carbs_g,
        source, macro_source, amount_g, food_id, is_demo,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 'snack', '', '',
             NULL, NULL, NULL, NULL,
             'manual', 'manual', NULL, NULL, 0,
             ?, ?, ?)`,
    [id, USER_ID, TS, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedPantry(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_pantries
       (id, user_id, name, text, created_at, updated_at, deleted_at)
     VALUES (?, ?, '', '', ?, ?, ?)`,
    [id, USER_ID, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedRecipe(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_recipes
       (id, user_id, name, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, '', '{}', ?, ?, ?)`,
    [id, USER_ID, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedPrefs(
  client: SqliteMigrationClient,
  userId: string = USER_ID,
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_prefs
       (user_id, prefs_json, active_pantry_id, created_at, updated_at)
     VALUES (?, '{}', NULL, ?, ?)`,
    [userId, TS, TS],
  );
}

describe("probeNutritionParity", () => {
  it("reports match when both sides are empty", async () => {
    const handle = await createTestSqlite();
    try {
      const out = await probeNutritionParity(
        handle.client,
        USER_ID,
        EMPTY_STATE,
      );
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        meals: { ls: 0, sqlite: 0 },
        pantries: { ls: 0, sqlite: 0 },
        recipes: { ls: 0, sqlite: 0 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports match when LS and SQLite agree on every entity class", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMeal(handle.client, "m1");
      await seedMeal(handle.client, "m2");
      await seedPantry(handle.client, "p1");
      await seedRecipe(handle.client, "r1");
      await seedRecipe(handle.client, "r2");
      await seedPrefs(handle.client);

      const next: NutritionDualWriteState = {
        meals: [makeMeal("m1"), makeMeal("m2")],
        pantries: [makePantry("p1")],
        prefs: makePrefs(),
        recipes: [makeRecipe("r1"), makeRecipe("r2")],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        meals: { ls: 2, sqlite: 2 },
        pantries: { ls: 1, sqlite: 1 },
        recipes: { ls: 2, sqlite: 2 },
        prefs: { ls: true, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores soft-deleted SQLite rows in the parity comparison", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMeal(handle.client, "m1");
      await seedMeal(handle.client, "m2", { deletedAt: TS });
      await seedPantry(handle.client, "p1", { deletedAt: TS });
      await seedRecipe(handle.client, "r1");

      const next: NutritionDualWriteState = {
        meals: [makeMeal("m1")],
        pantries: [],
        prefs: null,
        recipes: [makeRecipe("r1")],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        meals: { ls: 1, sqlite: 1 },
        pantries: { ls: 0, sqlite: 0 },
        recipes: { ls: 1, sqlite: 1 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with lsOnly when SQLite is missing a meal", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMeal(handle.client, "m1");

      const next: NutritionDualWriteState = {
        meals: [makeMeal("m1"), makeMeal("m2")],
        pantries: [],
        prefs: null,
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        meals: { ls: 2, sqlite: 1, lsOnly: 1, sqliteOnly: 0 },
        pantries: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        recipes: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with sqliteOnly when SQLite has stale recipes", async () => {
    const handle = await createTestSqlite();
    try {
      await seedRecipe(handle.client, "r1");
      await seedRecipe(handle.client, "r2");
      await seedRecipe(handle.client, "r3");

      const next: NutritionDualWriteState = {
        meals: [],
        pantries: [],
        prefs: null,
        recipes: [makeRecipe("r1")],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        meals: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        pantries: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        recipes: { ls: 1, sqlite: 3, lsOnly: 0, sqliteOnly: 2 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when prefs presence diverges (LS has prefs, SQLite does not)", async () => {
    const handle = await createTestSqlite();
    try {
      const next: NutritionDualWriteState = {
        meals: [],
        pantries: [],
        prefs: makePrefs(),
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        meals: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        pantries: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        recipes: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        prefs: { ls: true, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when prefs presence diverges (SQLite has prefs, LS does not)", async () => {
    const handle = await createTestSqlite();
    try {
      await seedPrefs(handle.client);

      const next: NutritionDualWriteState = {
        meals: [],
        pantries: [],
        prefs: null,
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        meals: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        pantries: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        recipes: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        prefs: { ls: false, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with both lsOnly and sqliteOnly when pantries diverge symmetrically", async () => {
    const handle = await createTestSqlite();
    try {
      await seedPantry(handle.client, "p-old");

      const next: NutritionDualWriteState = {
        meals: [],
        pantries: [makePantry("p-new")],
        prefs: null,
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        meals: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        pantries: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
        recipes: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("scopes the read to user_id so other users' rows don't leak in", async () => {
    const handle = await createTestSqlite();
    try {
      // Other-user rows that must be excluded.
      await handle.client.run(
        `INSERT INTO nutrition_meals
           (id, user_id, eaten_at, meal_type, name, label,
            kcal, protein_g, fat_g, carbs_g,
            source, macro_source, amount_g, food_id, is_demo,
            created_at, updated_at, deleted_at)
         VALUES ('other-m', 'user-2', ?, 'snack', '', '',
                 NULL, NULL, NULL, NULL,
                 'manual', 'manual', NULL, NULL, 0,
                 ?, ?, NULL)`,
        [TS, TS, TS],
      );
      await seedPrefs(handle.client, "user-2");
      await seedMeal(handle.client, "m1");

      const next: NutritionDualWriteState = {
        meals: [makeMeal("m1")],
        pantries: [],
        prefs: null,
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        meals: { ls: 1, sqlite: 1 },
        pantries: { ls: 0, sqlite: 0 },
        recipes: { ls: 0, sqlite: 0 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores LS entries with empty or non-string ids", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMeal(handle.client, "m1");

      // Inject malformed entries past the type-check. The probe must
      // defensively skip them rather than surface a phantom mismatch.
      const malformedMeals = [
        makeMeal("m1"),
        { ...makeMeal(""), id: "" },
        { ...makeMeal("ignored"), id: 42 },
      ] as unknown as readonly NutritionMealSnapshot[];

      const next: NutritionDualWriteState = {
        meals: malformedMeals,
        pantries: [],
        prefs: null,
        recipes: [],
      };

      const out = await probeNutritionParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        meals: { ls: 1, sqlite: 1 },
        pantries: { ls: 0, sqlite: 0 },
        recipes: { ls: 0, sqlite: 0 },
        prefs: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });
});

function makeMeal(id: string): NutritionMealSnapshot {
  return {
    id,
    dateKey: "2026-05-08",
    time: "10:00",
    mealType: "snack",
    name: "",
    label: "",
    macros: null,
    source: "manual",
    macroSource: "manual",
    amountG: null,
    foodId: null,
    isDemo: false,
  };
}

function makePantry(id: string): NutritionPantrySnapshot {
  return {
    id,
    name: "",
    text: "",
    items: [],
  };
}

function makeRecipe(id: string): NutritionRecipeSnapshot {
  return {
    id,
    title: "",
    dataJson: "{}",
  };
}

function makePrefs(): NutritionPrefsSnapshot {
  return {
    prefsJson: "{}",
    activePantryId: null,
  };
}
