/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __clearFinykDualWriteContextForTests,
  registerFinykDualWriteContext,
} from "../../modules/finyk/lib/sqliteWriter/index";
import {
  __clearFizrukDualWriteContextForTests,
  registerFizrukDualWriteContext,
} from "../../modules/fizruk/lib/sqliteWriter/index";
import {
  __clearRoutineDualWriteContextForTests,
  registerRoutineDualWriteContext,
} from "../../modules/routine/lib/sqliteWriter/index";
import {
  __clearNutritionDualWriteContextForTests,
  registerNutritionDualWriteContext,
} from "../../modules/nutrition/lib/sqliteWriter/index";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../modules/fizruk/lib/sqliteReader";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../modules/routine/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../modules/nutrition/lib/sqliteReader";
import {
  isHubRestoreModuleReady,
  isHubRestoreReady,
} from "./hubBackupReadiness";
import { useHubRestoreReady } from "./useHubRestoreReady";

// Справжні реєстри й кеші модулів: готовність читає саме їх, тож і тест
// ставить стан їхніми штатними тестовими засобами, без жодного vi.mock.
const ctx = {
  getUserId: () => "u1",
  getMigrationClient: async () => null,
  getNow: () => "2026-10-03T00:00:00.000Z",
  logger: () => {},
};

type Mod = "finyk" | "fizruk" | "routine" | "nutrition";
const MODULES: readonly Mod[] = ["finyk", "fizruk", "routine", "nutrition"];
const teardowns: Partial<Record<Mod, () => void>> = {};

function register(m: Mod): void {
  teardowns[m]?.();
  teardowns[m] =
    m === "finyk"
      ? registerFinykDualWriteContext(ctx)
      : m === "fizruk"
        ? registerFizrukDualWriteContext(ctx)
        : m === "routine"
          ? registerRoutineDualWriteContext(ctx)
          : registerNutritionDualWriteContext(ctx);
}

function unregister(m: Mod): void {
  teardowns[m]?.();
  delete teardowns[m];
}

function warm(m: Mod): void {
  if (m === "finyk") __setFinykSqliteStateCacheForTests({});
  else if (m === "fizruk") __setFizrukSqliteCacheForTests({});
  else if (m === "nutrition") __setNutritionSqliteCacheForTests({});
  else {
    __setRoutineSqliteStateCacheForTests({});
    __setRoutineSqliteCompletionsCacheForTests({});
  }
}

function cool(m: Mod): void {
  if (m === "finyk") clearFinykSqliteCache();
  else if (m === "fizruk") clearFizrukSqliteCache();
  else if (m === "nutrition") clearNutritionSqliteCache();
  else {
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  }
}

beforeEach(() => {
  for (const m of MODULES) {
    register(m);
    warm(m);
  }
});

afterEach(() => {
  vi.useRealTimers();
  for (const m of MODULES) {
    unregister(m);
    cool(m);
  }
  __clearFinykDualWriteContextForTests();
  __clearFizrukDualWriteContextForTests();
  __clearRoutineDualWriteContextForTests();
  __clearNutritionDualWriteContextForTests();
});

describe("isHubRestoreReady", () => {
  it("готово, коли всі чотири модулі зареєстровані й прогріті", () => {
    expect(isHubRestoreReady()).toBe(true);
  });

  it.each(MODULES)("%s: незареєстрований контекст = не готово", (m) => {
    unregister(m);
    expect(isHubRestoreModuleReady(m)).toBe(false);
    expect(isHubRestoreReady()).toBe(false);
  });

  it.each(MODULES)("%s: холодний кеш = не готово", (m) => {
    cool(m);
    expect(isHubRestoreModuleReady(m)).toBe(false);
    expect(isHubRestoreReady()).toBe(false);
  });

  it("Рутина потребує обидва кеші: і стану, і відміток", () => {
    clearSqliteCompletionsCache();
    expect(isHubRestoreModuleReady("routine")).toBe(false);
  });
});

describe("useHubRestoreReady", () => {
  it("опитує, доки контекст не зареєструється, і далі стає true", () => {
    vi.useFakeTimers();
    unregister("finyk");
    const { result } = renderHook(() => useHubRestoreReady());
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);

    register("finyk");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current).toBe(true);
  });

  it("одразу true, коли все вже готове", () => {
    const { result } = renderHook(() => useHubRestoreReady());
    expect(result.current).toBe(true);
  });
});
