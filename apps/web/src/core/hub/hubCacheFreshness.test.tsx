// @vitest-environment jsdom
// Register the same real entry counters as the lazy root boot clusters.
import "../../modules/finyk/lib/sqliteReadBoot";
import "../../modules/nutrition/lib/sqliteReadBoot";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { countRealEntries } from "../onboarding/firstRealEntry";
import { useHubStorageBump } from "./useHubStorageBump";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../modules/nutrition/lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../../modules/nutrition/lib/sqliteReadGate";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";
import { notifyFinykSqliteCacheRefresh } from "../../modules/finyk/lib/sqliteReadGate";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../modules/finyk/lib/monoMirrorReader";
import { notifyFinykMonoMirrorRefresh } from "../../modules/finyk/lib/monoMirrorGate";
import { clearFizrukSqliteCache } from "../../modules/fizruk/lib/sqliteReader";
import {
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../modules/routine/lib/sqliteReader";

function reset() {
  localStorage.clear();
  clearNutritionSqliteCache();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
  clearFizrukSqliteCache();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
}
beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
});

describe("Hub hydration independently of derived spending/calorie changes", () => {
  it.each(["nutrition", "manual income", "bank"])(
    "re-reads real entries after %s cache hydration",
    (source) => {
      // This is the Hub's real subscriber + real onboarding probe. No module
      // screen or quick-stats writer mounts to supply an accidental bump.
      const { result } = renderHook(() => {
        useHubStorageBump();
        return countRealEntries();
      });
      expect(result.current).toBe(0);
      act(() => {
        if (source === "nutrition") {
          __setNutritionSqliteCacheForTests({
            log: {
              "2026-10-15": {
                meals: [
                  {
                    id: "meal",
                    name: "Вода",
                    label: "Вода",
                    time: "12:00",
                    mealType: "lunch",
                    source: "manual",
                    macroSource: "manual",
                    foodId: null,
                    amount_g: null,
                    macros: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
                  },
                ],
              },
            },
          });
          notifyNutritionSqliteCacheRefresh();
        } else if (source === "manual income") {
          __setFinykSqliteStateCacheForTests({
            manualExpenses: [
              {
                id: "income",
                date: "2026-10-15",
                amount: 100,
                kind: "income",
                description: "Зарплата",
                category: "salary",
              },
            ],
          });
          notifyFinykSqliteCacheRefresh();
        } else {
          __setFinykMonoMirrorCacheForTests({
            transactions: [{ id: "bank", amount: 100 }] as never[],
          });
          notifyFinykMonoMirrorRefresh();
        }
      });
      expect(result.current).toBe(1);
    },
  );
});
