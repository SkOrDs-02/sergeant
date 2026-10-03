// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { useWorkoutTemplates } from "./useWorkoutTemplates";

const TEMPLATE = {
  id: "wt_seed_1",
  name: "Груди",
  exerciseIds: ["bench-press"],
  groups: [],
  updatedAt: "2026-09-16T07:00:00.000Z",
};

function lastOpKinds() {
  const call = vi.mocked(triggerFizrukDualWrite).mock.calls.at(-1);
  if (!call) throw new Error("triggerFizrukDualWrite was not called");
  return diffFizrukDualWriteOps(call[0], call[1]).map((op) => op.kind);
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ workoutTemplates: [TEMPLATE] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useWorkoutTemplates — undo, поки delete ще в черзі dual-write", () => {
  it("«видалити → Повернути» до refresh кешу дає upsert шаблону", () => {
    const { result } = renderHook(() => useWorkoutTemplates());
    act(() => {
      result.current.removeTemplate(TEMPLATE.id);
    });
    expect(lastOpKinds()).toEqual(["workout-template-delete"]);

    act(() => {
      result.current.restoreTemplate(TEMPLATE, 0);
    });
    expect(result.current.templates.map((t) => t.id)).toEqual([TEMPLATE.id]);
    expect(lastOpKinds()).toEqual(["workout-template-upsert"]);
  });
});
