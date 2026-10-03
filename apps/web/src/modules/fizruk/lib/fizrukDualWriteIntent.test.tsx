// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Зареєстрований контекст, щоб `peekFizrukDualWriteState()` читав кеш;
// сам запис не потрібен — хелпер лише будує prev/next.
vi.mock("./sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import {
  fizrukDualWriteTransition,
  useFizrukIntendedSlice,
} from "./fizrukDualWriteIntent";
import { extractMeasurementSnapshots } from "./fizrukDualWriteState";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "./sqliteReader";

const M1 = { id: "m_1", at: "2026-09-16T07:00:00.000Z", weightKg: 81.2 };
const M2 = { id: "m_2", at: "2026-09-15T07:00:00.000Z", weightKg: 80.9 };
const ids = (slice: readonly { id: string }[]) => slice.map((m) => m.id);

beforeEach(() => {
  __setFizrukSqliteCacheForTests({
    measurements: [M1],
    dailyLog: [
      {
        id: "dl_1",
        at: "2026-09-16T07:00:00.000Z",
        weightKg: null,
        sleepHours: 7,
        energyLevel: null,
        moodScore: null,
        note: "",
      },
    ],
  });
});
afterEach(() => clearFizrukSqliteCache());

describe("fizrukDualWriteTransition", () => {
  it("перший запис diff-иться від кешу, наступний — від наміру, а після тіка знову від кешу", () => {
    const { result, rerender } = renderHook(
      ({ tick }) => useFizrukIntendedSlice<"measurements">(tick),
      { initialProps: { tick: 0 } },
    );
    const ref = result.current;

    // 1. Наміру ще немає — prev береться з кешу.
    const t1 = fizrukDualWriteTransition("measurements", ref, []);
    expect(ids(t1.prev.measurements)).toEqual(["m_1"]);
    expect(ids(t1.next.measurements)).toEqual([]);

    // 2. Кеш не оновився (delete ще в черзі), але prev — уже наш намір.
    const t2 = fizrukDualWriteTransition(
      "measurements",
      ref,
      extractMeasurementSnapshots([M1]),
    );
    expect(ids(t2.prev.measurements)).toEqual([]);
    expect(ids(t2.next.measurements)).toEqual(["m_1"]);

    // 3. Тік кешу: черга затихла, sync підтягнув M2 — prev знову з кешу.
    __setFizrukSqliteCacheForTests({ measurements: [M1, M2] });
    rerender({ tick: 1 });
    const t3 = fizrukDualWriteTransition(
      "measurements",
      ref,
      extractMeasurementSnapshots([M1, M2]),
    );
    expect(ids(t3.prev.measurements)).toEqual(["m_1", "m_2"]);
  });

  it("не чіпає чужі зрізи — вони завжди з кешу", () => {
    const { result } = renderHook(() =>
      useFizrukIntendedSlice<"measurements">(0),
    );
    const t = fizrukDualWriteTransition("measurements", result.current, []);
    expect(t.prev.dailyLog.map((e) => e.id)).toEqual(["dl_1"]);
    expect(t.next.dailyLog.map((e) => e.id)).toEqual(["dl_1"]);
  });
});
