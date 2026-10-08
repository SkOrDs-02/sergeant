import { describe, it, expect } from "vitest";

import {
  canUseCachePartition,
  selectCachesToClear,
  shouldCacheExerciseImage,
  shouldUseRuntimeCache,
  VOLATILE_API_PREFIXES,
} from "./cachePolicy";

/**
 * Volatile-prefix regression test. The predicate lives in
 * `./cachePolicy` to keep workbox out of the import graph (workbox
 * touches `self.__WB_DISABLE_DEV_LOGS` at module-init and crashes
 * under jsdom). Test imports the policy module directly.
 */
const shouldCache = shouldUseRuntimeCache;

describe("apps/web sw runtime cache predicate", () => {
  it("matches exercise images without matching API requests", () => {
    expect(shouldCacheExerciseImage("/exercises/x/0.webp")).toBe(true);
    expect(shouldCacheExerciseImage("/api/exercises/x/0.webp")).toBe(false);
  });

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
      "/api/v1/sync/",
      "/api/v1/coach",
      "/api/v1/weekly-digest",
    ]);
  });

  // priv-08: `@sergeant/api-client` переписує `/api/*` у `/api/v1/*` до fetch
  // (DEFAULT_API_PREFIX), тож SW бачить саме v1-шляхи. Без v1-префіксів
  // coach/digest/sync-запити йшли в NetworkFirst-кеш.
  it("excludes the /api/v1/* mirrors of the volatile prefixes (priv-08)", () => {
    expect(shouldCache("/api/v1/coach/memory", "GET")).toBe(false);
    expect(shouldCache("/api/v1/coach/insight", "GET")).toBe(false);
    expect(shouldCache("/api/v1/weekly-digest", "GET")).toBe(false);
    expect(shouldCache("/api/v1/sync/pull", "GET")).toBe(false);
  });

  it("does NOT widen the policy: /me and /ai-memory stay cacheable (owner decision)", () => {
    expect(shouldCache("/api/v1/me", "GET")).toBe(true);
    expect(shouldCache("/api/v1/ai-memory/list", "GET")).toBe(true);
    expect(shouldCache("/api/v1/finyk/transactions", "GET")).toBe(true);
  });
});

describe("canUseCachePartition (priv-08)", () => {
  const HASH = "0123456789abcdef0123456789abcdef";

  it("не кешує /api/* під партицією anon (ключ користувача невідомий)", () => {
    expect(canUseCachePartition("/api/v1/me", "anon")).toBe(false);
    expect(canUseCachePartition("/api/v1/me", "")).toBe(false);
    expect(canUseCachePartition("/api/v1/me", null)).toBe(false);
    expect(canUseCachePartition("/api/v1/me", undefined)).toBe(false);
  });

  it("кешує /api/* під ключем конкретного користувача", () => {
    expect(canUseCachePartition("/api/v1/me", HASH)).toBe(true);
  });

  it("навігації (не /api) лишаються доступні й під anon", () => {
    expect(canUseCachePartition("/welcome", "anon")).toBe(true);
    expect(canUseCachePartition("/", null)).toBe(true);
  });
});

describe("selectCachesToClear (rel-12)", () => {
  const names = [
    "workbox-precache-v2-https://example.test/",
    "navigations-v1",
    "api-cache-v1",
    "exercise-images-v1",
    "google-fonts-css",
    "google-fonts-woff",
    "sw-meta",
    "foreign-cache",
  ];

  it('"user" не чіпає precache, ілюстрації вправ і шрифти', () => {
    const toDelete = selectCachesToClear(names, "user");
    expect(toDelete).toEqual(["navigations-v1", "api-cache-v1", "sw-meta"]);
    expect(toDelete.some((n) => n.startsWith("workbox-precache"))).toBe(false);
    expect(toDelete.some((n) => n.startsWith("exercise-images-v"))).toBe(false);
  });

  it('"all" дає повний набір кешів SW і не чіпає чужі', () => {
    expect(selectCachesToClear(names, "all")).toEqual([
      "workbox-precache-v2-https://example.test/",
      "navigations-v1",
      "api-cache-v1",
      "exercise-images-v1",
      "google-fonts-css",
      "google-fonts-woff",
      "sw-meta",
    ]);
  });
});
