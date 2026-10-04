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
import { switchSqliteUser } from "../db/sqlite";
import { createSyncEngineReaderRuntime } from "../syncEngine/syncEngineReader";
import {
  __resetInitialPullStateForTests,
  hasCompletedInitialPull,
  markInitialPullComplete,
} from "../syncEngine/initialPullState";
import {
  getHubRestoreBlock,
  getHubRestoreModuleBlock,
  isHubRestoreModuleReady,
  isHubRestoreReady,
} from "./hubBackupReadiness";
import { useHubRestoreBlock, useHubRestoreReady } from "./useHubRestoreReady";

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

describe("перший pull з акаунта (data-07: новий пристрій)", () => {
  // Активна партиція SQLite визначає, чи є користувач синхронізованим: це той
  // самий `readActiveSqliteUserId`, що й у проді (`AuthContext` -> `setSqliteUser`).
  afterEach(async () => {
    __resetInitialPullStateForTests();
    await switchSqliteUser(null);
  });

  it("залогінений, кеші теплі, pull ще не було: імпорт заблокований як `sync`", async () => {
    await switchSqliteUser("u1");
    expect(hasCompletedInitialPull("u1")).toBe(false);
    expect(isHubRestoreReady()).toBe(false);
    expect(getHubRestoreBlock()).toBe("sync");
    for (const m of MODULES) {
      expect(isHubRestoreModuleReady(m)).toBe(false);
      expect(getHubRestoreModuleBlock(m)).toBe("sync");
    }
  });

  it("після повного pull імпорт відкривається", async () => {
    await switchSqliteUser("u1");
    markInitialPullComplete("u1", {});
    expect(getHubRestoreBlock()).toBeNull();
    expect(isHubRestoreReady()).toBe(true);
  });

  it("pull чужого користувача не рахується", async () => {
    await switchSqliteUser("u1");
    markInitialPullComplete("u2", {});
    expect(getHubRestoreBlock()).toBe("sync");
  });

  it("холодний кеш лишається `loading`, навіть якщо pull був", async () => {
    await switchSqliteUser("u1");
    markInitialPullComplete("u1", {});
    cool("finyk");
    expect(getHubRestoreBlock()).toBe("loading");
    expect(getHubRestoreModuleBlock("finyk")).toBe("loading");
  });

  it("анонім (`anon` партиція) pull не потребує", () => {
    expect(getHubRestoreBlock()).toBeNull();
  });

  it("реальний reader: імпорт закритий, доки pull іде, і відкривається після його завершення", async () => {
    await switchSqliteUser("u1");
    let finishPull: (page: { ops: []; next_cursor: null }) => void = () => {};
    const pull = vi.fn(
      () =>
        new Promise<{ ops: []; next_cursor: null }>((resolve) => {
          finishPull = resolve;
        }),
    );
    const reader = createSyncEngineReaderRuntime({
      pull: pull as never,
      resolveClient: async () => ({
        all: async () => [],
        run: async () => {},
        exec: async () => {},
      }),
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: () => 0,
      clearInterval: () => {},
      eventTarget: {
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const run = reader.pullOnce();
    await vi.waitFor(() => expect(pull).toHaveBeenCalled());
    expect(getHubRestoreBlock()).toBe("sync");

    finishPull({ ops: [], next_cursor: null });
    await run;
    expect(getHubRestoreBlock()).toBeNull();
  });

  it("хук: чекає на pull і відкривається, коли той завершився", async () => {
    vi.useFakeTimers();
    await switchSqliteUser("u1");
    const { result } = renderHook(() => useHubRestoreBlock());
    expect(result.current).toBe("sync");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe("sync");

    markInitialPullComplete("u1", {});
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current).toBeNull();
  });
});
