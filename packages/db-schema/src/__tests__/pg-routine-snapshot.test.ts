import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  routineEntries,
  routineStreaks,
  routineHabits,
  routineTags,
  routineCategories,
  routinePrefs,
  routinePushups,
  routineHabitOrder,
  routineCompletionNotes,
} from "../pg/routine.js";

/**
 * SQL snapshot tests: verify that the Drizzle schemas for routine tables
 * match the shapes defined in migrations 026_routine_tables.sql (entries +
 * streaks) and 050_routine_full_state.sql (habits, tags, categories,
 * prefs, pushups, habitOrder, completionNotes).
 *
 * Mirrors the structural pattern from `pg-waitlist-snapshot.test.ts` —
 * checks names, types, nullability, defaults, indexes — rather than
 * generating raw DDL (which varies across Drizzle versions).
 */

describe("pg/routineEntries schema snapshot", () => {
  const config = getTableConfig(routineEntries);

  it("should have the correct table name", () => {
    expect(config.name).toBe("routine_entries");
  });

  it("should define all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "completed_at",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("should have correct column types matching migration 026", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);
    expect(columnMap["id"]!.hasDefault).toBe(true);

    // user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    // name TEXT NOT NULL
    expect(columnMap["name"]!.dataType).toBe("string");
    expect(columnMap["name"]!.notNull).toBe(true);

    // completed_at TIMESTAMPTZ (nullable)
    expect(columnMap["completed_at"]!.dataType).toBe("date");
    expect(columnMap["completed_at"]!.notNull).toBe(false);

    // created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    expect(columnMap["created_at"]!.dataType).toBe("date");
    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);

    // updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    expect(columnMap["updated_at"]!.dataType).toBe("date");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);

    // deleted_at TIMESTAMPTZ (nullable, soft-delete tombstone)
    expect(columnMap["deleted_at"]!.dataType).toBe("date");
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("should define both required indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("routine_entries_user_created_idx");
    expect(indexNames).toContain("routine_entries_user_active_idx");
  });

  it("partial active index has WHERE clause on deleted_at", () => {
    const activeIdx = config.indexes.find(
      (i) => i.config.name === "routine_entries_user_active_idx",
    );
    expect(activeIdx).toBeDefined();
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("pg/routineStreaks schema snapshot", () => {
  const config = getTableConfig(routineStreaks);

  it("should have the correct table name", () => {
    expect(config.name).toBe("routine_streaks");
  });

  it("should define all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "current_streak",
      "longest_streak",
      "last_completed_at",
    ]);
  });

  it("should have correct column types matching migration 026", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // user_id TEXT PRIMARY KEY (FK to "user" — modelled, not a runtime check)
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["user_id"]!.notNull).toBe(true);

    // current_streak INTEGER NOT NULL DEFAULT 0
    expect(columnMap["current_streak"]!.dataType).toBe("number");
    expect(columnMap["current_streak"]!.notNull).toBe(true);
    expect(columnMap["current_streak"]!.hasDefault).toBe(true);

    // longest_streak INTEGER NOT NULL DEFAULT 0
    expect(columnMap["longest_streak"]!.dataType).toBe("number");
    expect(columnMap["longest_streak"]!.notNull).toBe(true);
    expect(columnMap["longest_streak"]!.hasDefault).toBe(true);

    // last_completed_at TIMESTAMPTZ (nullable)
    expect(columnMap["last_completed_at"]!.dataType).toBe("date");
    expect(columnMap["last_completed_at"]!.notNull).toBe(false);
  });
});

// -----------------------------------------------------------------
// Stage 10 — 7 new Routine tables (migration 050_routine_full_state.sql)
// -----------------------------------------------------------------

describe("pg/routineHabits schema snapshot", () => {
  const config = getTableConfig(routineHabits);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_habits");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "emoji",
      "tag_ids",
      "category_id",
      "archived",
      "paused",
      "recurrence",
      "start_date",
      "end_date",
      "time_of_day",
      "reminder_times",
      "weekdays",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("has a partial active index on user_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "routine_habits_user_active_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.where).toBeDefined();
  });
});

describe("pg/routineTags schema snapshot", () => {
  const config = getTableConfig(routineTags);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_tags");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "scope",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("has a partial active index on user_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "routine_tags_user_active_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.where).toBeDefined();
  });
});

describe("pg/routineCategories schema snapshot", () => {
  const config = getTableConfig(routineCategories);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_categories");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "emoji",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("has a partial active index on user_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "routine_categories_user_active_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.where).toBeDefined();
  });
});

describe("pg/routinePrefs schema snapshot", () => {
  const config = getTableConfig(routinePrefs);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_prefs");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["user_id", "data", "updated_at"]);
  });

  it("has user_id as PK", () => {
    const col = config.columns.find((c) => c.name === "user_id");
    expect(col!.primary).toBe(true);
  });
});

describe("pg/routinePushups schema snapshot", () => {
  const config = getTableConfig(routinePushups);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_pushups");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["user_id", "date_key", "reps", "updated_at"]);
  });
});

describe("pg/routineHabitOrder schema snapshot", () => {
  const config = getTableConfig(routineHabitOrder);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_habit_order");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["user_id", "order", "updated_at"]);
  });

  it("has user_id as PK", () => {
    const col = config.columns.find((c) => c.name === "user_id");
    expect(col!.primary).toBe(true);
  });
});

describe("pg/routineCompletionNotes schema snapshot", () => {
  const config = getTableConfig(routineCompletionNotes);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_completion_notes");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "note_key",
      "note",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("has a partial active index on user_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "routine_completion_notes_user_active_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.where).toBeDefined();
  });
});
