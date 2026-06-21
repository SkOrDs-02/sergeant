/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "@nutrition/lib/sqliteReader";
import { exportModuleData } from "./exportHandler";
import type { ExportModuleDataAction } from "../types";

// `fizruk_workouts_v1` / `nutrition_log_v1` / `nutrition_prefs_v1` are
// tombstoned — the export now reads the canonical SQLite caches (ADR-0067
// residual). `fizruk_daily_log_v1` stays LS-backed (not tombstoned).

function action(module: string, format = "text"): ExportModuleDataAction {
  return { input: { module, format } } as unknown as ExportModuleDataAction;
}

beforeEach(() => {
  localStorage.clear();
  clearFizrukSqliteCache();
  clearNutritionSqliteCache();
});

describe("exportHandler — canonical SQLite reads (ADR-0067 residual)", () => {
  it("exports fizruk workouts from the SQLite cache, not the drained LS key", () => {
    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w-export",
          startedAt: "2026-06-14T10:00:00.000Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    } as unknown as Parameters<typeof __setFizrukSqliteCacheForTests>[0]);
    const out = exportModuleData(action("fizruk", "json"));
    expect(out).toContain("w-export");
    expect(out).not.toContain("Тренування: немає даних");
  });

  it("exports the nutrition log from canonical storage", () => {
    __setNutritionSqliteCacheForTests({
      log: {
        "2026-06-14": {
          meals: [{ id: "m1", name: "Салат", macros: { kcal: 200 } }],
        },
      },
    } as unknown as Parameters<typeof __setNutritionSqliteCacheForTests>[0]);
    expect(exportModuleData(action("nutrition"))).toContain("Салат");
  });
});
