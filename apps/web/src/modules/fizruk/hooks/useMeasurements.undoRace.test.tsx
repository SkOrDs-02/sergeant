// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementEntry } from "@sergeant/fizruk-domain";

// Те саме, що `useDailyLog.undoRace.test.tsx`: кеш навмисно лишається
// «позаду» — між enqueue і apply → refresh справжньої черги.
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
import {
  __resetFizrukSqliteReadGateForTests,
  notifyFizrukSqliteCacheRefresh,
} from "../lib/sqliteReadGate";
import { useMeasurements } from "./useMeasurements";

const ENTRY: MeasurementEntry = {
  id: "m_seed_1",
  at: "2026-09-16T07:00:00.000Z",
  weightKg: 81.2,
};
const SYNCED: MeasurementEntry = {
  id: "m_synced_2",
  at: "2026-09-15T07:00:00.000Z",
  weightKg: 80.9,
};

function lastOpKinds() {
  const call = vi.mocked(triggerFizrukDualWrite).mock.calls.at(-1);
  if (!call) throw new Error("triggerFizrukDualWrite was not called");
  return diffFizrukDualWriteOps(call[0], call[1]).map((op) => op.kind);
}

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ measurements: [ENTRY] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useMeasurements — undo, поки delete ще в черзі dual-write", () => {
  it("«видалити → Повернути» до refresh кешу дає upsert, а не «без змін»", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => {
      result.current.deleteEntry(ENTRY.id);
    });
    expect(lastOpKinds()).toEqual(["measurement-delete"]);

    act(() => {
      result.current.restoreEntry(ENTRY);
    });
    expect(result.current.entries.map((e) => e.id)).toEqual([ENTRY.id]);
    expect(lastOpKinds()).toEqual(["measurement-upsert"]);
  });

  it("після тіка кешу prev знову з кешу — чужий запис не пере-upsert-иться", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => {
      result.current.deleteEntry(ENTRY.id);
    });
    act(() => {
      result.current.restoreEntry(ENTRY);
    });
    __setFizrukSqliteCacheForTests({ measurements: [ENTRY, SYNCED] });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    act(() => {
      result.current.addEntry({ weightKg: 80 });
    });
    const call = vi.mocked(triggerFizrukDualWrite).mock.calls.at(-1)!;
    // Prev — знову кеш (разом із SYNCED), а не застарілий намір [ENTRY];
    // інакше SYNCED виглядав би як щойно доданий, а його відсутність у
    // наступному наміру — як видалення. Diff чіпає лише новий рядок: ні
    // видалень, ні пере-upsert-у ENTRY/SYNCED.
    expect(call[0].measurements.map((m) => m.id)).toEqual([
      ENTRY.id,
      SYNCED.id,
    ]);
    const ops = diffFizrukDualWriteOps(call[0], call[1]);
    expect(ops.map((op) => op.kind)).toEqual(["measurement-upsert"]);
    const [upsert] = ops;
    expect(
      upsert?.kind === "measurement-upsert" ? upsert.measurement.id : null,
    ).not.toBeOneOf([ENTRY.id, SYNCED.id]);
    expect(call[1].measurements.map((m) => m.id)).toContain(SYNCED.id);
  });
});
