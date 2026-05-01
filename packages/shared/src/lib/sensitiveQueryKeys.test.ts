/**
 * Tests for the sensitive query-key policy used by the web and
 * mobile React Query persisters. See
 * `docs/planning/storage-roadmap.md` PR #004.
 *
 * The policy is the only thing standing between auth/me/coach/sync
 * /balance feeds and a verbatim copy of those payloads being
 * written to IDB / MMKV on every cache mutation. A regression here
 * is silent — the persister still works, it just leaks more data —
 * so we exercise every namespace and fragment explicitly rather
 * than parameterise.
 */
import { describe, it, expect } from "vitest";

import {
  SENSITIVE_QUERY_KEY_FRAGMENTS,
  SENSITIVE_QUERY_KEY_NAMESPACES,
  isSensitiveQueryKey,
} from "./sensitiveQueryKeys";

describe("isSensitiveQueryKey — namespace exclusions", () => {
  it("excludes the auth namespace", () => {
    expect(isSensitiveQueryKey(["auth"])).toBe(true);
    expect(isSensitiveQueryKey(["auth", "session"])).toBe(true);
    expect(isSensitiveQueryKey(["auth", "csrf-token"])).toBe(true);
  });

  it("excludes the me namespace", () => {
    expect(isSensitiveQueryKey(["me"])).toBe(true);
    expect(isSensitiveQueryKey(["me", "current"])).toBe(true);
    expect(isSensitiveQueryKey(["me", "settings"])).toBe(true);
    expect(isSensitiveQueryKey(["me", "finance", "balance"])).toBe(true);
  });

  it("excludes the coach namespace", () => {
    expect(isSensitiveQueryKey(["coach"])).toBe(true);
    expect(isSensitiveQueryKey(["coach", "memory"])).toBe(true);
    expect(isSensitiveQueryKey(["coach", "insight", "2025-05-01"])).toBe(true);
  });

  it("excludes the sync namespace", () => {
    expect(isSensitiveQueryKey(["sync"])).toBe(true);
    expect(isSensitiveQueryKey(["sync", "manifest"])).toBe(true);
    expect(isSensitiveQueryKey(["sync", "module", "finyk"])).toBe(true);
  });
});

describe("isSensitiveQueryKey — fragment exclusions", () => {
  it("excludes any tuple containing the `balance` fragment", () => {
    // Privatbank balance feed lives under the otherwise-fine `privat`
    // namespace, so the fragment-level rule is what protects it.
    expect(isSensitiveQueryKey(["privat", "balance"])).toBe(true);
    expect(isSensitiveQueryKey(["privat", "balance", "uah"])).toBe(true);
    expect(isSensitiveQueryKey(["finyk", "balance"])).toBe(true);
  });

  it("excludes any tuple containing the `balance-final` fragment", () => {
    expect(isSensitiveQueryKey(["privat", "balance-final"])).toBe(true);
    expect(isSensitiveQueryKey(["privat", "balance-final", "USD"])).toBe(true);
  });
});

describe("isSensitiveQueryKey — non-sensitive keys are allowed", () => {
  it("permits routine / nutrition / fizruk feeds", () => {
    expect(isSensitiveQueryKey(["routine"])).toBe(false);
    expect(isSensitiveQueryKey(["routine", "today"])).toBe(false);
    expect(isSensitiveQueryKey(["nutrition", "log", "2025-05-01"])).toBe(false);
    expect(isSensitiveQueryKey(["fizruk", "session"])).toBe(false);
  });

  it("permits finyk feeds outside of the balance fragment", () => {
    // The PAT lives only on the server (PR #002); finyk's own
    // module-level data — budgets, transactions list, categories —
    // remains persistable.
    expect(isSensitiveQueryKey(["finyk", "transactions"])).toBe(false);
    expect(isSensitiveQueryKey(["finyk", "budgets", "2025-05"])).toBe(false);
    expect(isSensitiveQueryKey(["finyk", "categories"])).toBe(false);
  });

  it("permits hub / digest / push feeds", () => {
    expect(isSensitiveQueryKey(["hub"])).toBe(false);
    expect(isSensitiveQueryKey(["digest", "weekly"])).toBe(false);
    expect(isSensitiveQueryKey(["push", "subscriptions"])).toBe(false);
  });
});

describe("isSensitiveQueryKey — degenerate inputs", () => {
  it("returns false for non-arrays", () => {
    expect(isSensitiveQueryKey(undefined)).toBe(false);
    expect(isSensitiveQueryKey(null)).toBe(false);
    expect(isSensitiveQueryKey("auth")).toBe(false);
    expect(isSensitiveQueryKey(42)).toBe(false);
    expect(isSensitiveQueryKey({ namespace: "auth" })).toBe(false);
  });

  it("returns false for an empty tuple", () => {
    expect(isSensitiveQueryKey([])).toBe(false);
  });

  it("ignores non-string segments without throwing", () => {
    // Query keys can mix in numeric / object filter segments. We
    // only inspect string segments, but a non-string segment must
    // not short-circuit later string segments.
    expect(isSensitiveQueryKey([42, { from: "2025-01-01" }, "coach"])).toBe(
      true,
    );
    expect(isSensitiveQueryKey([{ filter: "x" }, "routine"])).toBe(false);
    expect(isSensitiveQueryKey([null, undefined, 7])).toBe(false);
  });
});

describe("SENSITIVE_QUERY_KEY_NAMESPACES contents", () => {
  it("exposes a stable snapshot of blocked namespaces", () => {
    // Snapshot the set so additions / removals are reviewed
    // explicitly. The list is small and security-sensitive — silent
    // drift is exactly what this test is meant to catch.
    expect([...SENSITIVE_QUERY_KEY_NAMESPACES].sort()).toEqual([
      "auth",
      "coach",
      "me",
      "sync",
    ]);
  });
});

describe("SENSITIVE_QUERY_KEY_FRAGMENTS contents", () => {
  it("exposes a stable snapshot of blocked fragments", () => {
    expect([...SENSITIVE_QUERY_KEY_FRAGMENTS].sort()).toEqual([
      "balance",
      "balance-final",
    ]);
  });
});
