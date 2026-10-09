// @vitest-environment jsdom
/**
 * Last validated: 2026-10-09
 * Status: Active
 *
 * ux-11 (зауваження верифікації): «Повернути» після видалення з підсумку
 * завершеного тренування нічого не відновлювало, бо `restoreWorkout`
 * належав екземпляру `useWorkouts`, який `onClose()` розмонтував раніше за
 * тап по тосту. Тут справжній `useWorkouts` (renderHook + unmount між
 * delete та undo) і справжній dual-write diff; мокається лише тригер запису.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain";

const registered = vi.hoisted(() => ({ value: true }));

vi.mock("./sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => registered.value,
}));

import { triggerFizrukDualWrite } from "./sqliteWriter/index";
import { diffFizrukDualWriteOps } from "./sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "./sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "./sqliteReadGate";
import { useWorkouts } from "../hooks/useWorkouts";
import { restoreWorkoutDetached } from "./restoreWorkoutDetached";

const WORKOUT: Workout = {
  id: "w_ended_1",
  startedAt: "2026-09-29T18:00:00.000Z",
  endedAt: "2026-09-29T19:00:00.000Z",
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
  registered.value = true;
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ workouts: [WORKOUT] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("restoreWorkoutDetached — undo переживає розмонтування хука", () => {
  it("delete + unmount в одному обробнику, потім «Повернути» → upsert того ж запису", () => {
    const { result, unmount } = renderHook(() => useWorkouts());

    // Рівно те, що робить summary: deleteWorkout() і одразу onClose() →
    // сторінка (разом із хуком) знімається з дерева.
    act(() => {
      result.current.deleteWorkout(WORKOUT.id);
      unmount();
    });
    expect(vi.mocked(triggerFizrukDualWrite)).toHaveBeenCalledTimes(1);
    expect(ops(0).map((o) => o.kind)).toEqual(["workout-delete"]);

    // Кеш ще не оновився (delete у черзі) — найважче вікно для undo.
    restoreWorkoutDetached(WORKOUT);

    expect(vi.mocked(triggerFizrukDualWrite)).toHaveBeenCalledTimes(2);
    const restoreOps = ops(1);
    expect(restoreOps.map((o) => o.kind)).toEqual(["workout-upsert"]);
    expect(JSON.stringify(restoreOps[0])).toContain(WORKOUT.id);
  });

  it("restore з розмонтованого хука нічого не пише — саме тому undo не через хук", () => {
    const { result, unmount } = renderHook(() => useWorkouts());
    const hookRestore = result.current.restoreWorkout;
    act(() => {
      result.current.deleteWorkout(WORKOUT.id);
      unmount();
    });
    vi.mocked(triggerFizrukDualWrite).mockClear();

    hookRestore(WORKOUT);

    expect(triggerFizrukDualWrite).not.toHaveBeenCalled();
  });

  it("кеш уже оновився після delete (запису в ньому нема) → теж upsert", () => {
    __setFizrukSqliteCacheForTests({ workouts: [] });

    restoreWorkoutDetached(WORKOUT);

    expect(ops(0).map((o) => o.kind)).toEqual(["workout-upsert"]);
  });

  it("без контексту dual-write (до входу) тихо нічого не робить", () => {
    registered.value = false;

    expect(() => restoreWorkoutDetached(WORKOUT)).not.toThrow();
    expect(triggerFizrukDualWrite).not.toHaveBeenCalled();
  });
});
