import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  getLongTasksSince,
  initLongTaskMonitor,
  type LongTaskEntry,
} from "./longTaskMonitor";

interface MockObserverCtor {
  instances: MockPerformanceObserver[];
  new (cb: PerformanceObserverCallback): MockPerformanceObserver;
}

class MockPerformanceObserver {
  static instances: MockPerformanceObserver[] = [];
  callback: PerformanceObserverCallback;
  observed: PerformanceObserverInit | null = null;
  disconnected = false;

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
    MockPerformanceObserver.instances.push(this);
  }

  observe(init: PerformanceObserverInit) {
    this.observed = init;
  }

  disconnect() {
    this.disconnected = true;
  }

  /** Test helper — dispatch entries through the callback. */
  emit(entries: LongTaskEntry[]) {
    const list = {
      getEntries: () => entries as unknown as PerformanceEntry[],
      getEntriesByName: () => [],
      getEntriesByType: () => [],
    } as PerformanceObserverEntryList;
    this.callback(list, this as unknown as PerformanceObserver);
  }
}

describe("longTaskMonitor", () => {
  const originalPO = globalThis.PerformanceObserver;

  beforeEach(() => {
    __resetForTests();
    MockPerformanceObserver.instances = [];
    (
      globalThis as unknown as { PerformanceObserver: MockObserverCtor }
    ).PerformanceObserver =
      MockPerformanceObserver as unknown as MockObserverCtor;
  });

  it("initLongTaskMonitor is idempotent", () => {
    initLongTaskMonitor();
    initLongTaskMonitor();
    initLongTaskMonitor();
    expect(MockPerformanceObserver.instances).toHaveLength(1);
  });

  it("observes type=longtask with buffered: true so missed-pre-init entries surface", () => {
    initLongTaskMonitor();
    const observed = MockPerformanceObserver.instances[0]?.observed;
    expect(observed).toEqual({ type: "longtask", buffered: true });
  });

  it("getLongTasksSince filters entries by startTime ≥ threshold", () => {
    initLongTaskMonitor();
    const mock = MockPerformanceObserver.instances[0];
    expect(mock).toBeDefined();
    if (!mock) return;
    mock.emit([
      { startTime: 100, duration: 60 },
      { startTime: 250, duration: 80 },
      { startTime: 500, duration: 120 },
    ]);

    expect(getLongTasksSince(0)).toHaveLength(3);
    expect(getLongTasksSince(200)).toEqual([
      { startTime: 250, duration: 80 },
      { startTime: 500, duration: 120 },
    ]);
    expect(getLongTasksSince(600)).toEqual([]);
  });

  it("returns empty array if observer never attached", () => {
    expect(getLongTasksSince(0)).toEqual([]);
  });

  it("survives PerformanceObserver throwing on observe (Safari ≤ 15)", () => {
    class ThrowingPO {
      callback: PerformanceObserverCallback;
      constructor(callback: PerformanceObserverCallback) {
        this.callback = callback;
      }
      observe() {
        throw new Error("longtask entryType unsupported");
      }
      disconnect() {}
    }
    (
      globalThis as unknown as { PerformanceObserver: typeof ThrowingPO }
    ).PerformanceObserver = ThrowingPO;
    expect(() => initLongTaskMonitor()).not.toThrow();
    expect(getLongTasksSince(0)).toEqual([]);
  });

  it("no-ops gracefully when PerformanceObserver is undefined", () => {
    // SSR / very old browsers.
    delete (globalThis as unknown as { PerformanceObserver?: unknown })
      .PerformanceObserver;
    expect(() => initLongTaskMonitor()).not.toThrow();
    expect(getLongTasksSince(0)).toEqual([]);
  });

  it("ring-buffers to a bounded size so a long session doesn't leak memory", () => {
    initLongTaskMonitor();
    const mock = MockPerformanceObserver.instances[0];
    expect(mock).toBeDefined();
    if (!mock) return;
    // Push 250 entries — MAX_ENTRIES is 200 internally; older entries
    // must roll off the head.
    const lots = Array.from({ length: 250 }, (_, i) => ({
      startTime: i,
      duration: 60,
    }));
    mock.emit(lots);
    const all = getLongTasksSince(0);
    expect(all.length).toBeLessThanOrEqual(200);
    // Newest entries are kept — verify the highest startTime is present.
    expect(all[all.length - 1]?.startTime).toBe(249);
  });

  // Restore the real global after each describe-block so adjacent
  // suites do not see the mocked constructor.
  it.skip("teardown", () => {
    if (originalPO) {
      (
        globalThis as unknown as {
          PerformanceObserver: typeof PerformanceObserver;
        }
      ).PerformanceObserver = originalPO;
    }
    vi.restoreAllMocks();
  });
});
