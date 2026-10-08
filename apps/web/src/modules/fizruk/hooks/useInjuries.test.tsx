// @vitest-environment jsdom
/**
 * `useInjuries` з РЕАЛЬНИМ persist (без моку `mark`/`markMany`): мокається
 * лише межа dual-write (`triggerFizrukDualWrite`), а diff рахується справжнім
 * `diffFizrukDualWriteOps` — так само, як це робить sqlite-writer.
 *
 * Регресія аудиту 2026-10-01 (data-36): цикл `mark()` у одному тіку брав той
 * самий застарілий `rows` N разів, і dual-write диффив кожен виклик проти
 * попереднього наміру (insert зони N + delete зони N-1), тож із трьох зон
 * лишалась одна.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

const trackEvent = vi.fn();
vi.mock("../../../core/observability/analytics", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../core/observability/analytics")
  >()),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { ANALYTICS_EVENTS } from "../../../core/observability/analytics";
import { useInjuries } from "./useInjuries";

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  trackEvent.mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ injuries: [] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

/** Усі dual-write виклики, прогнані через справжній diff. */
function allOps() {
  return vi
    .mocked(triggerFizrukDualWrite)
    .mock.calls.flatMap(([prev, next]) => diffFizrukDualWriteOps(prev, next));
}

describe("useInjuries.markMany — один persist на пачку зон", () => {
  it("три зони → три живі рядки, один dual-write і жодного delete", () => {
    const { result } = renderHook(() => useInjuries());
    act(() => {
      result.current.markMany(["knee", "spine-lumbar", "elbow"]);
    });

    expect(result.current.active.map((m) => m.site).sort()).toEqual([
      "elbow",
      "knee",
      "spine-lumbar",
    ]);
    expect(triggerFizrukDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = vi.mocked(triggerFizrukDualWrite).mock.calls[0]!;
    expect(next.injuries).toHaveLength(3);
    expect(next.injuries.every((i) => i.clearedAt === null)).toBe(true);

    const ops = allOps();
    expect(ops.filter((o) => o.kind === "injury-delete")).toEqual([]);
    expect(ops.filter((o) => o.kind === "injury-upsert")).toHaveLength(3);
  });

  it("відкидає невалідні, уже активні та повторені в межах виклику зони", () => {
    __setFizrukSqliteCacheForTests({
      injuries: [
        {
          id: "inj_old",
          site: "knee",
          startedAt: "2026-08-01T10:00:00.000Z",
          clearedAt: null,
          note: "",
        },
      ],
    });
    const { result } = renderHook(() => useInjuries());
    act(() => {
      result.current.markMany([
        "knee", // уже активна
        "elbow",
        "elbow", // дубль у межах виклику
        "not-a-site" as never, // невалідна
        "shoulder",
      ]);
    });

    expect(result.current.all.map((m) => m.site).sort()).toEqual([
      "elbow",
      "knee",
      "shoulder",
    ]);
    expect(triggerFizrukDualWrite).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED,
      { count: 2 },
    );
    expect(allOps().filter((o) => o.kind === "injury-delete")).toEqual([]);
  });

  it("не пише і не шле аналітику, коли додавати нічого", () => {
    const { result } = renderHook(() => useInjuries());
    act(() => {
      result.current.markMany([]);
      result.current.markMany(["nope" as never]);
    });
    expect(triggerFizrukDualWrite).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("аналітика FIZRUK_INJURY_MARKED несе кількість доданих зон", () => {
    const { result } = renderHook(() => useInjuries());
    act(() => {
      result.current.markMany(["knee", "elbow", "shoulder"]);
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED,
      { count: 3 },
    );
  });

  it("mark(site) лишається однозональним: count 1, дубль ігнорується", () => {
    const { result } = renderHook(() => useInjuries());
    act(() => {
      result.current.mark("knee", "після присідань");
    });
    expect(result.current.active).toHaveLength(1);
    expect(result.current.active[0]).toMatchObject({
      site: "knee",
      note: "після присідань",
    });
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED,
      { count: 1 },
    );

    act(() => {
      result.current.mark("knee");
    });
    expect(result.current.active).toHaveLength(1);
    expect(triggerFizrukDualWrite).toHaveBeenCalledTimes(1);
  });
});
