// @vitest-environment jsdom
/**
 * `pruneOldNotifiedKeys` was defined but never invoked anywhere in the
 * repo (P2 finding, W8) — the dedup Set grew without bound for the whole
 * SW lifetime, contradicting the module's own doc-comment. The fix wires
 * it into `recordNotified` (the only call site that ever adds keys), so
 * these tests assert the Set is actually trimmed, not just that the
 * pruning function works in isolation.
 *
 * No `fake-indexeddb` setup here on purpose: `globalThis.indexedDB` is
 * undefined under plain jsdom, and every IDB path in this module is
 * already best-effort (`.catch()`-swallowed) — the in-memory `Set`
 * mutation this suite cares about happens synchronously before any IDB
 * call, so it is observable without a real IndexedDB backend.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetNotifiedKeysForTests,
  notifiedKeys,
  pruneOldNotifiedKeys,
  recordNotified,
} from "./notifiedKeys";

beforeEach(() => {
  __resetNotifiedKeysForTests();
});
afterEach(() => {
  __resetNotifiedKeysForTests();
});

describe("pruneOldNotifiedKeys", () => {
  it("removes keys whose day-key suffix doesn't match and keeps the matching one", () => {
    notifiedKeys.add("routine_notify_h1_08:00_2026-06-14");
    notifiedKeys.add("routine_notify_h2_09:00_2026-06-15");

    pruneOldNotifiedKeys("2026-06-15");

    expect([...notifiedKeys]).toEqual(["routine_notify_h2_09:00_2026-06-15"]);
  });

  it("is idempotent for the same day-key (does not re-scan on every call)", () => {
    notifiedKeys.add("routine_notify_h1_08:00_2026-06-14");
    pruneOldNotifiedKeys("2026-06-15");
    expect(notifiedKeys.has("routine_notify_h1_08:00_2026-06-14")).toBe(false);

    // A stale key added AFTER the guard already latched today's dk is left
    // alone until the dk actually changes — this documents the guard's
    // behaviour, it is not the bug this suite is about.
    notifiedKeys.add("routine_notify_h3_10:00_2026-06-01");
    pruneOldNotifiedKeys("2026-06-15");
    expect(notifiedKeys.has("routine_notify_h3_10:00_2026-06-01")).toBe(true);

    pruneOldNotifiedKeys("2026-06-16");
    expect(notifiedKeys.has("routine_notify_h3_10:00_2026-06-01")).toBe(false);
  });
});

describe("recordNotified — сет справді підрізається", () => {
  it("prunes stale-day keys as a side effect of recording a new one", () => {
    notifiedKeys.add("routine_notify_h1_08:00_2026-06-10");
    notifiedKeys.add("routine_notify_h2_09:00_2026-06-12");

    recordNotified("routine_notify_h3_07:30_2026-06-15");

    expect([...notifiedKeys]).toEqual(["routine_notify_h3_07:30_2026-06-15"]);
  });

  it("never lets the set grow across many days once notifications keep firing", () => {
    for (let day = 1; day <= 30; day += 1) {
      const dk = `2026-06-${String(day).padStart(2, "0")}`;
      recordNotified(`routine_notify_h1_08:00_${dk}`);
    }
    // Only the most recent day's key should survive — this is the
    // unbounded-growth invariant the docblock promises.
    expect(notifiedKeys.size).toBe(1);
    expect(notifiedKeys.has("routine_notify_h1_08:00_2026-06-30")).toBe(true);
  });

  it("does not throw and skips pruning when the key has no day-key suffix", () => {
    expect(() => recordNotified("legacy-key-without-a-date")).not.toThrow();
    expect(notifiedKeys.has("legacy-key-without-a-date")).toBe(true);
  });

  it("is a no-op for an empty key", () => {
    recordNotified("");
    expect(notifiedKeys.size).toBe(0);
  });
});
