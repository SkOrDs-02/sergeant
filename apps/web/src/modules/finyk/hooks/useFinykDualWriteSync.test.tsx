// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const isRegistered = vi.fn();
const trigger = vi.fn();
const extract = vi.fn((..._a: unknown[]): unknown => ({ marker: "next" }));
const diff = vi.fn((..._a: unknown[]): unknown[] => [{ op: "upsert" }]);
const readTick = vi.fn(() => 0);

vi.mock("../lib/sqliteWriter/index.js", () => ({
  EMPTY_FINYK_STATE: { marker: "empty" },
  isFinykDualWriteRegistered: () => isRegistered(),
  triggerFinykDualWrite: (...a: unknown[]) => trigger(...a),
  diffFinykDualWriteOps: (...a: unknown[]) => diff(...a),
}));
vi.mock("../lib/sqliteWriter/extract.js", () => ({
  extractFinykDualWriteState: (...a: unknown[]) => extract(...a),
}));
vi.mock("../lib/sqliteReadGate.js", () => ({
  useFinykSqliteReadTick: () => readTick(),
}));

import {
  diffFinykDualWriteOps as actualDiff,
  EMPTY_FINYK_STATE as ACTUAL_EMPTY,
} from "../lib/sqliteWriter/diff.js";
import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

const slots = { showBalance: true } as unknown as FinykStorageSlots;

beforeEach(() => {
  vi.clearAllMocks();
  diff.mockReturnValue([{ op: "upsert" }]);
  readTick.mockReturnValue(0);
});

describe("useFinykDualWriteSync", () => {
  it("does not trigger a dual-write when no context is registered", () => {
    isRegistered.mockReturnValue(false);
    renderHook(() => useFinykDualWriteSync(slots));
    expect(trigger).not.toHaveBeenCalled();
    // It still snapshots the current state for the next diff.
    expect(extract).toHaveBeenCalledWith(slots, true);
  });

  it("skips the trigger on the first registered render (initial snapshot)", () => {
    isRegistered.mockReturnValue(true);
    renderHook(() => useFinykDualWriteSync(slots));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("triggers a dual-write on a subsequent change after registration", () => {
    isRegistered.mockReturnValue(true);
    extract
      .mockReturnValueOnce({ marker: "first" })
      .mockReturnValueOnce({ marker: "second" });

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    // Force the effect to run again with a changed slots reference.
    rerender({ s: { showBalance: false } as unknown as FinykStorageSlots });

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(
      { marker: "first" },
      { marker: "second" },
    );
  });

  it("skips the trigger when the diff is empty", () => {
    // Regression: `useFinykStorageSlots` returns a fresh object literal
    // per render, so this effect fires on every render — and
    // `triggerFinykDualWrite` ends with a cache-refresh notify that
    // re-renders it. Without the diff gate that loops forever
    // (~280 refreshes/s measured on `/finyk`, 2026-08-06).
    isRegistered.mockReturnValue(true);
    diff.mockReturnValue([]);

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });

    expect(trigger).not.toHaveBeenCalled();
  });

  describe("холодний старт: SQLite-кеш ще не прогрітий (data-13)", () => {
    // Справжній `diffFinykDualWriteOps` замість стаба: тут важить, ЯКІ саме
    // оп-и лишаються в діфі, а не сам факт виклику.
    const realDiff = actualDiff as (...a: unknown[]) => unknown[];
    const prefs = (
      showBalance: boolean,
      prefsJson = '{"merchantRules":[]}',
    ) => ({
      monthlyPlanJson: "{}",
      showBalance,
      excludedStatTxIdsJson: "[]",
      dismissedRecurringJson: "[]",
      prefsJson,
    });
    const state = (
      manualExpenses: Array<{ id: string; dataJson: string }>,
      showBalance = true,
    ) => ({ ...ACTUAL_EMPTY, manualExpenses, prefs: prefs(showBalance) });
    const cold = (tag: string) =>
      ({
        showBalance: true,
        storageReady: false,
        tag,
      }) as unknown as FinykStorageSlots;

    beforeEach(() => {
      isRegistered.mockReturnValue(true);
      diff.mockImplementation(realDiff);
    });

    it("пише витрату, додану до прогріву, а не відкидає її", () => {
      // Регресія: гард `storageReady === false` лише зсував `prevRef` і нічого
      // не писав — запис зникав мовчки, а `FinykApp` показував тост успіху.
      extract
        .mockReturnValueOnce(state([]))
        .mockReturnValueOnce(state([{ id: "e1", dataJson: '{"amount":12}' }]));
      const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
        initialProps: { s: cold("first") },
      });
      rerender({ s: cold("second") });

      expect(trigger).toHaveBeenCalledTimes(1);
      const [prev, next] = trigger.mock.calls[0] as [
        { manualExpenses: unknown[] },
        { manualExpenses: unknown[] },
      ];
      expect(prev.manualExpenses).toEqual([]);
      expect(next.manualExpenses).toEqual([
        { id: "e1", dataJson: '{"amount":12}' },
      ]);
    });

    it("не пише prefs до прогріву: правила мерчантів не перетираються дефолтами", () => {
      // Причина, заради якої гард з'явився (CodeRabbit, #1285): до прогріву
      // `merchantRules` у слотах — `[]`, тож тумблер `showBalance` дав би
      // `prefs-upsert`, що стирав збережені правила.
      extract
        .mockReturnValueOnce(state([]))
        .mockReturnValueOnce(state([], false));
      const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
        initialProps: { s: cold("first") },
      });
      rerender({ s: cold("second") });
      expect(trigger).not.toHaveBeenCalled();
    });

    it("пише рядок, але не prefs, коли до прогріву змінилось і те, і те", () => {
      extract
        .mockReturnValueOnce(state([]))
        .mockReturnValueOnce(
          state([{ id: "e1", dataJson: '{"amount":12}' }], false),
        );
      const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
        initialProps: { s: cold("first") },
      });
      rerender({ s: cold("second") });

      expect(trigger).toHaveBeenCalledTimes(1);
      const [prev, next] = trigger.mock.calls[0] as [
        { prefs: unknown },
        { prefs: unknown },
      ];
      // prefs-зріз однаковий з обох боків діфу: `prefs-upsert` не виникає.
      expect(next.prefs).toBe(prev.prefs);
      const ops = realDiff(prev, next) as Array<{ kind: string }>;
      expect(ops.map((o) => o.kind)).toEqual(["blob-upsert"]);
    });

    it("після прогріву нова база без пушу, а наступна локальна зміна пишеться як звичайно", () => {
      extract
        .mockReturnValueOnce(state([]))
        .mockReturnValueOnce(state([{ id: "e1", dataJson: "{}" }]));
      const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
        initialProps: { s: cold("first") },
      });
      rerender({ s: cold("second") });
      expect(trigger).toHaveBeenCalledTimes(1);

      // Overlay після прогріву: read-tick змінився — база без пушу.
      readTick.mockReturnValue(1);
      const hydrated = state([{ id: "e1", dataJson: "{}" }]);
      extract.mockReturnValueOnce(hydrated);
      rerender({
        s: {
          showBalance: true,
          storageReady: true,
        } as unknown as FinykStorageSlots,
      });
      expect(trigger).toHaveBeenCalledTimes(1);

      extract.mockReturnValueOnce(state([{ id: "e1", dataJson: "{}" }], false));
      rerender({
        s: {
          showBalance: false,
          storageReady: true,
        } as unknown as FinykStorageSlots,
      });
      expect(trigger).toHaveBeenCalledTimes(2);
      expect(trigger.mock.calls[1]?.[0]).toBe(hydrated);
    });
  });

  it("SYNC-3: does not re-push a change that arrived via a SQLite cache-overlay tick (pull echo)", () => {
    // Regression: `docs/work/specs/audits/2026-09-01-product-audit/findings.md`
    // § SYNC-3. `useFinykStorageSlots` overlays every slot from
    // `getCachedFinykSqliteState()` whenever the read-tick bumps — both
    // for a genuine remote pull AND for the echo of this device's own
    // just-settled local write. Before the fix, ANY slot difference
    // (including rows this device only just pulled from another device)
    // got diffed and pushed straight back out — an infinite re-push
    // loop. A tick change must resync the baseline WITHOUT triggering.
    isRegistered.mockReturnValue(true);
    readTick.mockReturnValue(0);
    extract.mockReturnValueOnce({ marker: "initial" });

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    // First render after registration: snapshot only, no trigger.
    expect(trigger).not.toHaveBeenCalled();

    // Simulate a pull landing: the read-tick bumps AND the slots object
    // now contains a row that wasn't in the previous snapshot (a diff
    // would be non-empty — `diff` is stubbed to always return an op).
    readTick.mockReturnValue(1);
    extract.mockReturnValueOnce({ marker: "pulled-in" });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });

    expect(trigger).not.toHaveBeenCalled();

    // A subsequent render with the tick UNCHANGED (a genuine local
    // mutation, not a cache overlay) must still trigger normally.
    extract.mockReturnValueOnce({ marker: "local-edit" });
    rerender({ s: { showBalance: false } as unknown as FinykStorageSlots });

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(
      { marker: "pulled-in" },
      { marker: "local-edit" },
    );
  });
});
