import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetFinykManualExpenseConflictsForTests,
  dismissAllFinykManualExpenseConflicts,
  dismissFinykManualExpenseConflict,
  FINYK_MANUAL_EXPENSE_CONFLICT_LIMIT,
  type FinykManualExpenseConflict,
  getFinykManualExpenseConflictsSnapshot,
  recordFinykManualExpenseConflict,
  subscribeFinykManualExpenseConflicts,
} from "./store";

function makeConflict(
  overrides: Partial<FinykManualExpenseConflict> = {},
): FinykManualExpenseConflict {
  return {
    transactionId: "tx-001",
    reason: "lww_conflict",
    localDataJson: '{"amount":42,"category":"food"}',
    attemptedClientTs: "2026-05-04T12:34:56.000Z",
    detectedAt: 1714831200000,
    ...overrides,
  };
}

describe("finyk manual-expense conflict store", () => {
  afterEach(() => {
    __resetFinykManualExpenseConflictsForTests();
  });

  it("starts with an empty snapshot whose reference is stable", () => {
    const snap1 = getFinykManualExpenseConflictsSnapshot();
    const snap2 = getFinykManualExpenseConflictsSnapshot();
    expect(snap1.conflicts).toHaveLength(0);
    // useSyncExternalStore relies on identity-comparison: idempotent
    // reads MUST return the same reference, otherwise React tears.
    expect(snap1).toBe(snap2);
  });

  it("records a conflict and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);

    const total = recordFinykManualExpenseConflict(makeConflict());

    expect(total).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getFinykManualExpenseConflictsSnapshot().conflicts).toHaveLength(1);
    expect(getFinykManualExpenseConflictsSnapshot().conflicts[0]).toMatchObject(
      {
        transactionId: "tx-001",
        reason: "lww_conflict",
      },
    );

    unsubscribe();
  });

  it("dedups by transactionId — newest record wins, no duplicate banner", () => {
    recordFinykManualExpenseConflict(
      makeConflict({
        transactionId: "tx-1",
        attemptedClientTs: "2026-01-01T00:00:00.000Z",
      }),
    );
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-2" }));
    // Second push of the SAME row — must replace, not duplicate.
    recordFinykManualExpenseConflict(
      makeConflict({
        transactionId: "tx-1",
        attemptedClientTs: "2026-05-04T12:34:56.000Z",
        reason: "tombstoned",
      }),
    );

    const conflicts = getFinykManualExpenseConflictsSnapshot().conflicts;
    expect(conflicts).toHaveLength(2);
    const tx1 = conflicts.find((c) => c.transactionId === "tx-1");
    expect(tx1?.reason).toBe("tombstoned");
    expect(tx1?.attemptedClientTs).toBe("2026-05-04T12:34:56.000Z");
  });

  it("after dedup-replace, the replaced conflict moves to tail (FIFO age-out invariant)", () => {
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-A" }));
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-B" }));
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-C" }));
    // Re-record A — should land at the tail of the array.
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-A" }));

    const ids = getFinykManualExpenseConflictsSnapshot().conflicts.map(
      (c) => c.transactionId,
    );
    expect(ids).toEqual(["tx-B", "tx-C", "tx-A"]);
  });

  it("caps the queue at MAX_CONFLICTS — oldest entries age out FIFO", () => {
    for (let i = 0; i < FINYK_MANUAL_EXPENSE_CONFLICT_LIMIT + 5; i++) {
      recordFinykManualExpenseConflict(
        makeConflict({ transactionId: `tx-${i}` }),
      );
    }

    const conflicts = getFinykManualExpenseConflictsSnapshot().conflicts;
    expect(conflicts).toHaveLength(FINYK_MANUAL_EXPENSE_CONFLICT_LIMIT);
    // First 5 (tx-0..tx-4) must have aged out; tail must be the latest record.
    expect(conflicts[0].transactionId).toBe("tx-5");
    expect(conflicts[conflicts.length - 1].transactionId).toBe(
      `tx-${FINYK_MANUAL_EXPENSE_CONFLICT_LIMIT + 4}`,
    );
  });

  it("dismissFinykManualExpenseConflict removes one row and notifies", () => {
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-2" }));

    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);
    listener.mockReset();

    dismissFinykManualExpenseConflict("tx-1");

    expect(listener).toHaveBeenCalledTimes(1);
    const conflicts = getFinykManualExpenseConflictsSnapshot().conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].transactionId).toBe("tx-2");

    unsubscribe();
  });

  it("dismiss for unknown transactionId is a no-op (no listener notification)", () => {
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));

    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);
    listener.mockReset();
    const before = getFinykManualExpenseConflictsSnapshot();

    dismissFinykManualExpenseConflict("tx-does-not-exist");

    expect(listener).not.toHaveBeenCalled();
    // Snapshot reference must NOT change — useSyncExternalStore relies on
    // identity-comparison to skip re-renders.
    expect(getFinykManualExpenseConflictsSnapshot()).toBe(before);

    unsubscribe();
  });

  it("dismissAll empties the queue and notifies once", () => {
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-2" }));
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-3" }));

    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);
    listener.mockReset();

    dismissAllFinykManualExpenseConflicts();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getFinykManualExpenseConflictsSnapshot().conflicts).toHaveLength(0);

    unsubscribe();
  });

  it("dismissAll on empty queue is a no-op (no listener notification)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);

    dismissAllFinykManualExpenseConflicts();

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("unsubscribed listeners stop receiving notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFinykManualExpenseConflicts(listener);

    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-2" }));
    // Still 1 — second record didn't fan out to detached listener.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not block other listeners or break the publisher", () => {
    // sync-error-isolation contract: bug у одному компоненті не повинен
    // блокувати notify-fanout у решти підписників (інакше один поганий
    // banner ламає всю систему сповіщень). Стори ре-кидає async-помилку
    // через `setTimeout(0)` — у тестах ми стабуємо timer, щоб помилка
    // не падала вже на наступний tick і не валила Vitest unhandled-error
    // budget.
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- мінімалістичний stub: ховаємо callback від реальної івент-петлі, повертаємо плейсхолдер-id який Vitest не валідує.
      .mockImplementation((() => 0 as unknown) as any);

    const angry = vi.fn(() => {
      throw new Error("boom");
    });
    const calm = vi.fn();

    const u1 = subscribeFinykManualExpenseConflicts(angry);
    const u2 = subscribeFinykManualExpenseConflicts(calm);

    // The publisher must not throw synchronously even though one
    // listener throws.
    expect(() =>
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" })),
    ).not.toThrow();

    expect(angry).toHaveBeenCalledTimes(1);
    expect(calm).toHaveBeenCalledTimes(1);
    // Error is re-thrown async via setTimeout(0) so Sentry still
    // captures it without breaking the synchronous mutation site.
    expect(setTimeoutSpy).toHaveBeenCalled();

    u1();
    u2();
    setTimeoutSpy.mockRestore();
  });

  it("snapshot reference changes on every mutation (re-render cue for React)", () => {
    const before = getFinykManualExpenseConflictsSnapshot();
    recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));
    const after = getFinykManualExpenseConflictsSnapshot();
    expect(after).not.toBe(before);
    expect(after.conflicts).not.toBe(before.conflicts);
  });
});
