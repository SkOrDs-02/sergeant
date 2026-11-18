// @vitest-environment jsdom
/**
 * Фз-2 (OD-28): «Повернутись у сесію» після завершення, коли сторінка з
 * хуком `useWorkouts` уже розмонтована (людина пройшла аркуші й натиснула
 * «Готово» за ці 10 секунд). Справжній `useWorkouts` і справжній diff;
 * мокається лише тригер запису.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";

vi.mock("./sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import { triggerFizrukDualWrite } from "./sqliteWriter/index";
import { diffFizrukDualWriteOps } from "./sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "./sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "./sqliteReadGate";
import { useWorkouts } from "../hooks/useWorkouts";
import { reopenWorkoutDetached } from "./reopenWorkoutDetached";

const ACTIVE: Workout = {
  id: "w_live_1",
  startedAt: "2026-11-18T18:00:00.000Z",
  endedAt: null,
  items: [],
  groups: [],
  warmup: null,
  cooldown: null,
  note: "",
};

function ops(callIndex: number) {
  const call = vi.mocked(triggerFizrukDualWrite).mock.calls[callIndex];
  if (!call) throw new Error(`no triggerFizrukDualWrite call #${callIndex}`);
  return diffFizrukDualWriteOps(call[0], call[1]);
}

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ workouts: [ACTIVE] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("reopenWorkoutDetached", () => {
  it("після endWorkout + unmount пише upsert того ж запису з endedAt = null, навіть коли кеш ще не наздогнав", () => {
    const { result, unmount } = renderHook(() => useWorkouts());
    act(() => {
      result.current.endWorkout(ACTIVE.id);
      unmount();
    });
    expect(ops(0).map((o) => o.kind)).toEqual(["workout-upsert"]);

    // Кеш ще тримає незавершений запис (finish у черзі): diff проти кешу
    // був би порожнім, а finish із черги лишив би тренування завершеним.
    reopenWorkoutDetached(ACTIVE, "2026-11-18T19:00:00.000Z");

    expect(vi.mocked(triggerFizrukDualWrite)).toHaveBeenCalledTimes(2);
    const reopenOps = ops(1);
    expect(reopenOps.map((o) => o.kind)).toEqual(["workout-upsert"]);
    const call = vi.mocked(triggerFizrukDualWrite).mock.calls[1]!;
    const next = call[1].workouts.find((w) => w.id === ACTIVE.id);
    expect(next?.endedAt ?? null).toBeNull();
  });

  it("нічого не воскрешає, якщо тренування вже видалили з кешу", () => {
    __setFizrukSqliteCacheForTests({ workouts: [] });
    reopenWorkoutDetached(ACTIVE, "2026-11-18T19:00:00.000Z");
    expect(vi.mocked(triggerFizrukDualWrite)).not.toHaveBeenCalled();
  });
});
