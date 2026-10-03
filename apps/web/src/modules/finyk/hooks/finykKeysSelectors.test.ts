/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Per-module selector test (T-7) for the finyk RQ-key namespace.
 *
 * Hard Rule #2 — every finyk query/mutation keys through the centralized
 * `finykKeys` factory in `@shared/lib/api/queryKeys`, never an inline tuple.
 * This suite asserts the factory's *namespacing contract* from the finyk
 * module's vantage point: every selector roots under `["finyk", …]`, the
 * mono / privat sub-trees stay disjoint, and parameterised selectors fan out
 * to distinct cache lines (so `invalidateQueries` can scope precisely and
 * cross-account / cross-range reads never collide).
 */
import { describe, it, expect } from "vitest";
import { finykKeys } from "@shared/lib/api/queryKeys";

const FINYK_ROOT = "finyk";

describe("finykKeys — module namespace containment", () => {
  it("every selector roots under the finyk domain", () => {
    const staticKeys = [
      finykKeys.all,
      finykKeys.mono,
      finykKeys.monoSyncState,
      finykKeys.monoBackfillProgress,
      finykKeys.monoWebhookAccounts,
      finykKeys.monoWebhookTransactionsPrefix,
      finykKeys.privat,
    ];
    for (const key of staticKeys) {
      expect(key[0]).toBe(FINYK_ROOT);
    }

    const dynamicKeys = [
      finykKeys.proactiveAdvice("2026-05", "food"),
      finykKeys.monoTransactionsDb("a", "b", "c"),
      finykKeys.monoWebhookTransactions(),
    ];
    for (const key of dynamicKeys) {
      expect(key[0]).toBe(FINYK_ROOT);
    }
  });

  it("mono and privat sub-trees are disjoint under finyk", () => {
    expect(finykKeys.mono[1]).toBe("mono");
    expect(finykKeys.privat[1]).toBe("privat");
    expect(finykKeys.mono[1]).not.toBe(finykKeys.privat[1]);
  });

  it("monoBackfillProgress is a stable, parameter-free cache line", () => {
    // Polled key consumed by `useMonoBackfillProgress` — referential
    // stability matters so React Query dedupes the poll instead of
    // re-subscribing each render.
    expect(finykKeys.monoBackfillProgress).toBe(finykKeys.monoBackfillProgress);
    expect(finykKeys.monoBackfillProgress).toEqual([
      "finyk",
      "mono",
      "backfill-progress",
    ]);
  });

  it("monoWebhookTransactionsPrefix is the head shared by every bucketed key", () => {
    const prefix = finykKeys.monoWebhookTransactionsPrefix;
    const bucketed = finykKeys.monoWebhookTransactions("from=2026-01-01");
    expect(bucketed.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("monoTransactionsDb fans out to distinct keys per (from,to,accountId)", () => {
    const base = finykKeys.monoTransactionsDb("2026-01-01", "2026-01-31", "a1");
    const otherAccount = finykKeys.monoTransactionsDb(
      "2026-01-01",
      "2026-01-31",
      "a2",
    );
    const otherRange = finykKeys.monoTransactionsDb(
      "2026-02-01",
      "2026-02-28",
      "a1",
    );
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(otherAccount));
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(otherRange));
  });
});
