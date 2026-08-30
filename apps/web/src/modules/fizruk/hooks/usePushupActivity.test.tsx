// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { triggerFizrukDualWriteMock } = vi.hoisted(() => ({
  triggerFizrukDualWriteMock: vi.fn(),
}));

vi.mock("../lib/sqliteWriter", async () => {
  const actual = await vi.importActual<typeof import("../lib/sqliteWriter")>(
    "../lib/sqliteWriter",
  );
  return { ...actual, triggerFizrukDualWrite: triggerFizrukDualWriteMock };
});

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { usePushupActivity } from "./usePushupActivity";

vi.mock("../lib/fizrukDualWriteState", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/fizrukDualWriteState")
  >("../lib/fizrukDualWriteState");
  return {
    ...actual,
    // У тестах dual-write контекст не зареєстровано, тож справжній peek
    // повертав би null; будуємо стан прямо з кешу, як робить продакшн
    // після реєстрації контексту.
    peekFizrukDualWriteState: () => ({
      ...actual.EMPTY_FIZRUK_DUAL_WRITE_STATE,
      pushups: { "2026-01-05": 9 },
    }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 5, 0, 30));
  clearFizrukSqliteCache();
  triggerFizrukDualWriteMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  clearFizrukSqliteCache();
});

describe("usePushupActivity", () => {
  it("aggregates stats with local day keys from the fizruk cache", () => {
    __setFizrukSqliteCacheForTests({
      pushupsByDate: {
        "2025-12-06": 2,
        "2025-12-29": 5,
        "2026-01-05": 9,
      },
    });

    const { result } = renderHook(() => usePushupActivity(31));

    expect(result.current.stats).toEqual({
      todayCount: 9,
      week: 14,
      month: 16,
    });
    expect(result.current.hasData).toBe(true);
  });

  it("logReps додає повтори до СЬОГОДНІ поверх поточного стану", () => {
    const { result } = renderHook(() => usePushupActivity(7));
    let ok = false;
    act(() => {
      ok = result.current.logReps(15);
    });

    expect(ok).toBe(true);
    expect(triggerFizrukDualWriteMock).toHaveBeenCalledTimes(1);
    const [, next] = triggerFizrukDualWriteMock.mock.calls[0]!;
    expect(next.pushups["2026-01-05"]).toBe(24); // 9 наявних + 15 нових
  });

  it("logReps відхиляє невалідні значення без запису", () => {
    const { result } = renderHook(() => usePushupActivity(7));
    act(() => {
      expect(result.current.logReps(0)).toBe(false);
      expect(result.current.logReps(-3)).toBe(false);
      expect(result.current.logReps(Number.NaN)).toBe(false);
    });
    expect(triggerFizrukDualWriteMock).not.toHaveBeenCalled();
  });
});
