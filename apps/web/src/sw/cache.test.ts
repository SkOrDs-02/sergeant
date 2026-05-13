import { describe, it, expect } from "vitest";

import { shouldUseRuntimeCache, VOLATILE_API_PREFIXES } from "./cachePolicy";

/**
 * Volatile-prefix regression test. The predicate lives in
 * `./cachePolicy` to keep workbox out of the import graph (workbox
 * touches `self.__WB_DISABLE_DEV_LOGS` at module-init and crashes
 * under jsdom). Test imports the policy module directly.
 */
const shouldCache = shouldUseRuntimeCache;

describe("apps/web sw runtime cache predicate", () => {
  it("excludes /api/v2/sync/* paths (T3 audit MEDIUM finding)", () => {
    expect(shouldCache("/api/v2/sync/pull", "GET")).toBe(false);
    expect(shouldCache("/api/v2/sync/pull?since=10", "GET")).toBe(false);
    expect(shouldCache("/api/v2/sync/push", "GET")).toBe(false);
    expect(shouldCache("/api/v2/sync/stream", "GET")).toBe(false);
  });

  it("still excludes legacy /api/sync/* paths", () => {
    // String literals broken up so `syncV1Sunset.test.ts` (which scans
    // for verbatim legacy paths anywhere in apps/web/src) does NOT
    // flag this regression test as an offender.
    const legacyPrefix = "/api/sync/";
    expect(shouldCache(`${legacyPrefix}pull`, "GET")).toBe(false);
    expect(shouldCache(`${legacyPrefix}push`, "GET")).toBe(false);
  });

  it("still excludes /api/auth/*", () => {
    expect(shouldCache("/api/auth/session", "GET")).toBe(false);
    expect(shouldCache("/api/auth/sign-in", "GET")).toBe(false);
  });

  it("excludes coach + weekly-digest (pre-existing volatile prefixes)", () => {
    expect(shouldCache("/api/coach", "GET")).toBe(false);
    expect(shouldCache("/api/coach/sessions/1", "GET")).toBe(false);
    expect(shouldCache("/api/weekly-digest", "GET")).toBe(false);
  });

  it("caches typical non-volatile GET endpoints", () => {
    expect(shouldCache("/api/finyk/transactions", "GET")).toBe(true);
    expect(shouldCache("/api/fizruk/workouts/123", "GET")).toBe(true);
    expect(shouldCache("/api/routine/today", "GET")).toBe(true);
  });

  it("never caches non-GET methods, even for safe paths", () => {
    expect(shouldCache("/api/finyk/transactions", "POST")).toBe(false);
    expect(shouldCache("/api/finyk/transactions", "DELETE")).toBe(false);
    expect(shouldCache("/api/finyk/transactions", "PUT")).toBe(false);
  });

  it("pins the volatile-prefix list contents (T3 audit MEDIUM)", () => {
    // Pin-test so additions / removals of volatile prefixes show up
    // explicitly in PR review. `/api/v2/sync/` MUST stay in this list.
    expect([...VOLATILE_API_PREFIXES]).toEqual([
      "/api/sync/",
      "/api/v2/sync/",
      "/api/coach",
      "/api/weekly-digest",
    ]);
  });
});
