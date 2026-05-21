/**
 * Global PerformanceObserver buffer for `longtask` entries.
 *
 * Mounted once at app boot ([`App.tsx`](../App.tsx) after auth ready).
 * Other RUM consumers ([`hubPerf.ts`](./hubPerf.ts) today, future
 * surfaces tomorrow) sample slices via {@link getLongTasksSince} rather
 * than wiring their own observer — this keeps the count of attached
 * `PerformanceObserver`s flat and the perf cost predictable.
 *
 * `longtask` is a JS-execution >50 ms event reported by browsers that
 * implement the [Long Tasks API](https://w3c.github.io/longtasks/).
 * Safari < 16 doesn't expose `entryTypes: ["longtask"]`, so the module
 * is best-effort — `init()` quietly no-ops there and `getLongTasksSince`
 * always returns `[]` (callers can still emit their events with
 * `longTaskCount: 0` so the analytics shape stays stable).
 *
 * @see [Initiative 0017 — Hub tabs mount perf](../../../docs/initiatives/0017-hub-tabs-mount-perf.md)
 */

export interface LongTaskEntry {
  /** `performance.now()`-relative timestamp where the long task began. */
  startTime: number;
  /** Long-task duration in ms. Always ≥ 50 by browser spec. */
  duration: number;
}

/**
 * Hard ceiling on retained entries. A 50 ms/event ring buffer of 200
 * covers ~30 s of intense main-thread work which is well beyond any
 * single tab-switch window we measure. Bounded so a single tab left
 * open for hours doesn't grow unbounded; older entries fall off when
 * the ring rotates.
 */
const MAX_ENTRIES = 200;

let observer: PerformanceObserver | null = null;
const entries: LongTaskEntry[] = [];

/**
 * Bootstrap the global longtask buffer. Idempotent — repeated calls
 * are no-ops once the observer is attached. Safe to call before paint
 * or during hydration; missed entries pre-init are surfaced via the
 * `buffered: true` flag on first `observe()`.
 */
export function initLongTaskMonitor(): void {
  if (observer) return;
  if (typeof PerformanceObserver === "undefined") return;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
        if (entries.length > MAX_ENTRIES) entries.shift();
      }
    });
    observer.observe({
      type: "longtask",
      buffered: true,
    });
  } catch {
    // Browser exposes PerformanceObserver but not `longtask` entries
    // (Safari ≤ 15). Leave `observer` null — `getLongTasksSince` will
    // return `[]` and callers degrade to `longTaskCount: 0` events.
    observer = null;
  }
}

/**
 * Slice of long-tasks that began at or after `startTime`. Used by
 * RUM consumers to attribute observed jank to a specific user-initiated
 * window (tab switch, modal open, etc.).
 *
 * Returns a fresh array — the caller may filter / aggregate without
 * affecting the ring buffer.
 */
export function getLongTasksSince(startTime: number): LongTaskEntry[] {
  return entries.filter((entry) => entry.startTime >= startTime);
}

/**
 * Test-only reset hook. Disconnects the observer and clears the buffer
 * so the next test starts from a clean state.
 */
export function __resetForTests(): void {
  if (observer) {
    try {
      observer.disconnect();
    } catch {
      /* noop */
    }
  }
  observer = null;
  entries.length = 0;
}
