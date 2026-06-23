// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const shouldPrefetch = vi.hoisted(() => vi.fn(() => true));
const getRecentModules = vi.hoisted(() => vi.fn<() => string[]>(() => []));
const setModulePrefetcher = vi.hoisted(() => vi.fn());

vi.mock("./connectionGate", () => ({
  shouldPrefetchOnConnection: shouldPrefetch,
}));
vi.mock("./intentPrefetch", () => ({ setModulePrefetcher }));
vi.mock("./recentModules", () => ({ getRecentModules }));

import {
  prefetchModule,
  prefetchPage,
  prefetchPageOnIntent,
  prefetchCriticalModules,
  prefetchHubNavigationPages,
  getPagePrefetchProps,
  isPagePrefetched,
} from "./useRoutePrefetch";

let ricSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  shouldPrefetch.mockReturnValue(true);
  getRecentModules.mockReturnValue([]);
  // Schedule but never execute the callback — keeps real dynamic imports
  // (heavy module chunks) from firing during the unit test.
  ricSpy = vi.fn();
  (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback =
    ricSpy;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("prefetchModule", () => {
  it("skips entirely on Save-Data / slow connections", () => {
    shouldPrefetch.mockReturnValue(false);
    prefetchModule("finyk");
    expect(ricSpy).not.toHaveBeenCalled();
  });

  it("schedules an idle prefetch when the connection is fast", () => {
    prefetchModule("fizruk");
    expect(ricSpy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repeated prefetches of the same module", () => {
    prefetchModule("routine");
    prefetchModule("routine");
    expect(ricSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to setTimeout when requestIdleCallback is missing", () => {
    delete (window as unknown as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    prefetchModule("nutrition");
    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});

describe("prefetchPage / prefetchPageOnIntent / isPagePrefetched", () => {
  it("marks a page as prefetched on intent and reports it", () => {
    // prefetchPageOnIntent → importPageChunk runs synchronously (no idle wrap).
    // The dynamic import is fire-and-forget; the chunk-set flag is set first.
    prefetchPageOnIntent("pricing");
    expect(isPagePrefetched("pricing")).toBe(true);
  });

  it("skips on slow connection", () => {
    shouldPrefetch.mockReturnValue(false);
    prefetchPage("design");
    expect(ricSpy).not.toHaveBeenCalled();
    expect(isPagePrefetched("design")).toBe(false);
  });

  it("schedules a page prefetch via idle callback", () => {
    prefetchPage("reports");
    expect(ricSpy).toHaveBeenCalledTimes(1);
  });
});

describe("prefetchCriticalModules", () => {
  it("skips on slow connection", () => {
    shouldPrefetch.mockReturnValue(false);
    prefetchCriticalModules();
    expect(ricSpy).not.toHaveBeenCalled();
  });

  it("schedules one idle callback per module, recents first", () => {
    getRecentModules.mockReturnValue(["nutrition"]);
    prefetchCriticalModules();
    // 4 modules total, each scheduled on its own idle callback.
    expect(ricSpy).toHaveBeenCalledTimes(4);
  });

  it("falls back to staggered setTimeout without requestIdleCallback", () => {
    delete (window as unknown as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    prefetchCriticalModules();
    expect(setTimeoutSpy).toHaveBeenCalledTimes(4);
  });
});

describe("prefetchHubNavigationPages", () => {
  it("skips on slow connection", () => {
    shouldPrefetch.mockReturnValue(false);
    prefetchHubNavigationPages();
    expect(ricSpy).not.toHaveBeenCalled();
  });

  it("schedules reports + settings idle prefetches", () => {
    prefetchHubNavigationPages();
    expect(ricSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to setTimeout without requestIdleCallback", () => {
    delete (window as unknown as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    prefetchHubNavigationPages();
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
  });
});

describe("getPagePrefetchProps", () => {
  it("returns hover/focus/pointer handlers that trigger an intent prefetch", () => {
    const props = getPagePrefetchProps("profile");
    expect(typeof props.onMouseEnter).toBe("function");
    props.onMouseEnter();
    expect(isPagePrefetched("profile")).toBe(true);
    // remaining handlers are no-ops after dedup but must not throw
    props.onFocus();
    props.onPointerDown();
  });
});
