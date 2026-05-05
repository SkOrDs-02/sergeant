import { describe, expect, it, vi } from "vitest";

import {
  createSyncEngineFlushOnReconnect,
  type SyncEngineEventTarget,
  type SyncEngineFlushOnReconnectDeps,
  type SyncEngineFlushOnReconnectOptions,
} from "./syncV2.flushOnReconnect";
import type { SyncEnginePushResult } from "./syncV2.pushLoop";
import type { SyncEnginePushScheduler } from "./syncV2.pushScheduler";

/**
 * Tests for the DOM-event → scheduler bridge `createSyncEngineFlushOnReconnect`
 * (PR #042e-flush of `docs/planning/storage-roadmap.md`). Eight test
 * groups pin the subscription contract, the de-duplication invariant
 * delegated to the scheduler, the error-swallow policy, the
 * visibility-edge filter, and the dispose lifecycle.
 *
 * Test fixtures (no real `window`):
 *
 *  - `makeEventTarget()` — a hand-rolled `addEventListener` /
 *    `removeEventListener` stub that records each registration and
 *    can fire stored handlers on demand. Mirrors `EventTarget`
 *    semantics minimally; we don't need bubbles / capture for the
 *    flush bridge. Exposes a `dispatch(type)` helper that calls
 *    every listener registered for the given type.
 *  - `makeScheduler()` — a stub `Pick<SyncEnginePushScheduler, 'flushNow'>`
 *    whose `flushNow` is a `vi.fn()` returning a configurable
 *    Promise. Used to exercise both the happy path and the rejection
 *    path without spinning up the real scheduler factory.
 */

interface EventTargetStubHandle {
  readonly target: SyncEngineEventTarget;
  /** All listener registrations that ever happened, in order. */
  readonly addCalls: ReadonlyArray<{
    type: string;
    listener: (event: Event) => void;
  }>;
  /** All listener removals that ever happened, in order. */
  readonly removeCalls: ReadonlyArray<{
    type: string;
    listener: (event: Event) => void;
  }>;
  /** Currently-active listeners (after add/remove resolution). */
  active(): ReadonlyArray<{
    type: string;
    listener: (event: Event) => void;
  }>;
  dispatch(type: string, event?: Event): void;
}

function makeEventTarget(): EventTargetStubHandle {
  const addCalls: Array<{
    type: string;
    listener: (event: Event) => void;
  }> = [];
  const removeCalls: Array<{
    type: string;
    listener: (event: Event) => void;
  }> = [];

  const target: SyncEngineEventTarget = {
    addEventListener(type, listener) {
      addCalls.push({ type, listener });
    },
    removeEventListener(type, listener) {
      removeCalls.push({ type, listener });
    },
  };

  return {
    target,
    addCalls,
    removeCalls,
    active(): ReadonlyArray<{
      type: string;
      listener: (event: Event) => void;
    }> {
      const result: Array<{
        type: string;
        listener: (event: Event) => void;
      }> = [];
      for (const add of addCalls) {
        const removed = removeCalls.some(
          (r) => r.type === add.type && r.listener === add.listener,
        );
        if (!removed) {
          result.push(add);
        }
      }
      return result;
    },
    dispatch(type, event = new Event(type)): void {
      for (const sub of this.active()) {
        if (sub.type === type) {
          sub.listener(event);
        }
      }
    },
  };
}

interface SchedulerStubHandle {
  readonly scheduler: Pick<SyncEnginePushScheduler, "flushNow">;
  readonly flushNow: ReturnType<typeof vi.fn>;
}

function makeScheduler(): SchedulerStubHandle {
  const flushNow = vi.fn();
  flushNow.mockResolvedValue({
    drained: 0,
    pushed: 0,
    retried: 0,
    rejected: 0,
  } satisfies SyncEnginePushResult);
  return {
    scheduler: { flushNow: flushNow as () => Promise<SyncEnginePushResult> },
    flushNow,
  };
}

interface MakeAdapterArgs {
  readonly options?: SyncEngineFlushOnReconnectOptions;
  readonly onFlushError?: (err: unknown) => void;
  readonly onFlushComplete?: (result: SyncEnginePushResult) => void;
  readonly isDocumentVisible?: () => boolean;
}

function makeAdapter(args: MakeAdapterArgs = {}): {
  adapter: ReturnType<typeof createSyncEngineFlushOnReconnect>;
  target: EventTargetStubHandle;
  schedulerHandle: SchedulerStubHandle;
} {
  const target = makeEventTarget();
  const schedulerHandle = makeScheduler();
  const deps: SyncEngineFlushOnReconnectDeps = {
    target: target.target,
    scheduler: schedulerHandle.scheduler,
    ...(args.onFlushError ? { onFlushError: args.onFlushError } : {}),
    ...(args.onFlushComplete ? { onFlushComplete: args.onFlushComplete } : {}),
    ...(args.isDocumentVisible
      ? { isDocumentVisible: args.isDocumentVisible }
      : {}),
  };
  const adapter = createSyncEngineFlushOnReconnect(deps, args.options ?? {});
  return { adapter, target, schedulerHandle };
}

describe("createSyncEngineFlushOnReconnect", () => {
  // ─────────────────────────────────────────────────────────────
  // Group 1 — subscription registration
  // ─────────────────────────────────────────────────────────────

  describe("subscription registration", () => {
    it("subscribes only to 'online' by default", () => {
      const { target } = makeAdapter();

      expect(target.addCalls.map((c) => c.type)).toEqual(["online"]);
    });

    it("subscribes to 'online' when kind='online'", () => {
      const { target } = makeAdapter({ options: { kind: "online" } });

      expect(target.addCalls.map((c) => c.type)).toEqual(["online"]);
    });

    it("subscribes to 'visibilitychange' when kind='visible'", () => {
      const { target } = makeAdapter({ options: { kind: "visible" } });

      expect(target.addCalls.map((c) => c.type)).toEqual(["visibilitychange"]);
    });

    it("subscribes to both event types when kind='both'", () => {
      const { target } = makeAdapter({ options: { kind: "both" } });

      expect(target.addCalls.map((c) => c.type).sort()).toEqual([
        "online",
        "visibilitychange",
      ]);
    });

    it("registers fresh handler references per event so removal is exact", () => {
      const { target } = makeAdapter({ options: { kind: "both" } });

      // The two handler references must be distinct so removeEventListener
      // can target each independently.
      const [first, second] = target.addCalls;
      expect(first?.listener).not.toBe(second?.listener);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 2 — flushNow invocation on online event
  // ─────────────────────────────────────────────────────────────

  describe("flushNow on 'online' event", () => {
    it("calls flushNow exactly once per online event", () => {
      const { target, schedulerHandle } = makeAdapter();

      target.dispatch("online");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });

    it("calls flushNow once per dispatch, not once per listener", () => {
      const { target, schedulerHandle } = makeAdapter();

      target.dispatch("online");
      target.dispatch("online");
      target.dispatch("online");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(3);
    });

    it("does not fire flushNow for unrelated event types", () => {
      const { target, schedulerHandle } = makeAdapter();

      target.dispatch("offline");
      target.dispatch("focus");
      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).not.toHaveBeenCalled();
    });

    it("invokes onFlushComplete with the result Promise resolved value", async () => {
      const onFlushComplete = vi.fn();
      const { target, schedulerHandle } = makeAdapter({ onFlushComplete });
      schedulerHandle.flushNow.mockResolvedValueOnce({
        drained: 3,
        pushed: 2,
        retried: 1,
        rejected: 0,
      });

      target.dispatch("online");
      // flushNow returns a Promise; observer fires after resolution.
      await Promise.resolve();
      await Promise.resolve();

      expect(onFlushComplete).toHaveBeenCalledTimes(1);
      expect(onFlushComplete).toHaveBeenCalledWith({
        drained: 3,
        pushed: 2,
        retried: 1,
        rejected: 0,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 3 — error policy on flushNow rejection
  // ─────────────────────────────────────────────────────────────

  describe("error policy on flushNow rejection", () => {
    it("routes a flushNow rejection to onFlushError", async () => {
      const onFlushError = vi.fn();
      const { target, schedulerHandle } = makeAdapter({ onFlushError });
      const boom = new Error("boom");
      schedulerHandle.flushNow.mockRejectedValueOnce(boom);

      target.dispatch("online");
      // Allow the rejected promise to settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(onFlushError).toHaveBeenCalledTimes(1);
      expect(onFlushError).toHaveBeenCalledWith(boom);
    });

    it("does NOT bubble flushNow rejection as an unhandled rejection", async () => {
      const unhandled = vi.fn();
      const onUnhandled = (event: { reason?: unknown }): void => {
        unhandled(event.reason);
      };
      // Best-effort: in node this fires on `process.on('unhandledRejection')`.
      // Vitest also captures unhandled rejections via its own listener.
      process.on("unhandledRejection", onUnhandled as never);

      try {
        const { target, schedulerHandle } = makeAdapter({
          onFlushError: () => {
            // swallow
          },
        });
        schedulerHandle.flushNow.mockRejectedValueOnce(new Error("boom"));

        target.dispatch("online");
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", onUnhandled as never);
      }
    });

    it("tolerates an onFlushError observer that itself throws", async () => {
      // The DOM event listener returns synchronously, but we want
      // to verify the observer-throw is *swallowed*, not thrown.
      const onFlushError = vi.fn().mockImplementation(() => {
        throw new Error("observer-bug");
      });
      const { target, schedulerHandle } = makeAdapter({ onFlushError });
      schedulerHandle.flushNow.mockRejectedValueOnce(new Error("boom"));

      target.dispatch("online");
      // Observer is async (post-rejection); flush microtasks.
      await Promise.resolve();
      await Promise.resolve();

      expect(onFlushError).toHaveBeenCalledTimes(1);
      // No second listener exists (and the throw didn't escape into
      // the dispatch loop) — sanity check by dispatching again.
      target.dispatch("online");
      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(2);
    });

    it("tolerates an onFlushComplete observer that throws", async () => {
      const onFlushComplete = vi.fn().mockImplementation(() => {
        throw new Error("observer-bug");
      });
      const { target, schedulerHandle } = makeAdapter({ onFlushComplete });

      target.dispatch("online");
      await Promise.resolve();
      await Promise.resolve();

      expect(onFlushComplete).toHaveBeenCalledTimes(1);
      // Subsequent dispatches still work.
      target.dispatch("online");
      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(2);
    });

    it("missing onFlushError + rejection is silent (no second-best logging side effect)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const { target, schedulerHandle } = makeAdapter();
        schedulerHandle.flushNow.mockRejectedValueOnce(new Error("boom"));

        target.dispatch("online");
        await Promise.resolve();
        await Promise.resolve();

        // Adapter does not fall back to console.error when no
        // observer is provided — that policy belongs to the boot
        // path (e.g., Sentry breadcrumbs).
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("guards against a synchronous throw from a buggy flushNow stub", () => {
      const onFlushError = vi.fn();
      const { target, schedulerHandle } = makeAdapter({ onFlushError });
      schedulerHandle.flushNow.mockImplementationOnce(() => {
        throw new Error("sync-bug");
      });

      // Must not throw out of the event listener.
      expect(() => target.dispatch("online")).not.toThrow();
      expect(onFlushError).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 4 — visibility-edge filter (kind='visible')
  // ─────────────────────────────────────────────────────────────

  describe("visibility-edge filter", () => {
    it("fires flushNow when the page is becoming visible", () => {
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "visible" },
        isDocumentVisible: () => true,
      });

      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });

    it("does not fire flushNow when the page is going hidden", () => {
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "visible" },
        isDocumentVisible: () => false,
      });

      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).not.toHaveBeenCalled();
    });

    it("re-evaluates the predicate on each event (transition appear→hide→appear)", () => {
      let visible = false;
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "visible" },
        isDocumentVisible: () => visible,
      });

      visible = true;
      target.dispatch("visibilitychange");
      visible = false;
      target.dispatch("visibilitychange");
      visible = true;
      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(2);
    });

    it("default predicate returns false when target has no document", () => {
      // No document on the stub target; default predicate must
      // degrade to "not visible" rather than throwing.
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "visible" },
      });

      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).not.toHaveBeenCalled();
    });

    it("default predicate fires when target.document.visibilityState='visible'", () => {
      const target = makeEventTarget();
      const docState = { visibilityState: "visible" as const };
      // Splice a document onto the structural target — production
      // `window` exposes this; our stub does not by default.
      const targetWithDoc: SyncEngineEventTarget = Object.assign(
        target.target,
        { document: docState },
      );
      const schedulerHandle = makeScheduler();
      createSyncEngineFlushOnReconnect(
        {
          target: targetWithDoc,
          scheduler: schedulerHandle.scheduler,
        },
        { kind: "visible" },
      );

      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 5 — kind='both' fan-out
  // ─────────────────────────────────────────────────────────────

  describe("kind='both' fan-out", () => {
    it("fires flushNow on 'online' even when 'visibilitychange' has not fired", () => {
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "both" },
        isDocumentVisible: () => true,
      });

      target.dispatch("online");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });

    it("fires flushNow on visible-edge 'visibilitychange' even when 'online' has not fired", () => {
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "both" },
        isDocumentVisible: () => true,
      });

      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });

    it("fires once per matching event (no de-dup at adapter layer)", () => {
      // The scheduler's own concurrency guard de-dupes overlapping
      // calls; the adapter does NOT add a second layer. This test
      // pins that behavior so a future change to add adapter-level
      // de-dup is a deliberate decision.
      const { target, schedulerHandle } = makeAdapter({
        options: { kind: "both" },
        isDocumentVisible: () => true,
      });

      target.dispatch("online");
      target.dispatch("visibilitychange");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 6 — dispose lifecycle
  // ─────────────────────────────────────────────────────────────

  describe("dispose lifecycle", () => {
    it("removes every listener it registered (kind='online')", () => {
      const { adapter, target } = makeAdapter();

      adapter.dispose();

      expect(target.removeCalls.map((c) => c.type)).toEqual(["online"]);
      expect(target.active()).toEqual([]);
    });

    it("removes every listener it registered (kind='both')", () => {
      const { adapter, target } = makeAdapter({ options: { kind: "both" } });

      adapter.dispose();

      expect(target.removeCalls.map((c) => c.type).sort()).toEqual([
        "online",
        "visibilitychange",
      ]);
      expect(target.active()).toEqual([]);
    });

    it("uses the same handler reference for register and unregister (so removal is exact)", () => {
      const { adapter, target } = makeAdapter({ options: { kind: "both" } });

      adapter.dispose();

      for (const add of target.addCalls) {
        const removeMatch = target.removeCalls.find((r) => r.type === add.type);
        expect(removeMatch?.listener).toBe(add.listener);
      }
    });

    it("is idempotent on a second dispose call (no double-remove)", () => {
      const { adapter, target } = makeAdapter();

      adapter.dispose();
      const callsAfterFirst = target.removeCalls.length;
      adapter.dispose();

      expect(target.removeCalls.length).toBe(callsAfterFirst);
    });

    it("after dispose, dispatched events do not call flushNow", () => {
      const { adapter, target, schedulerHandle } = makeAdapter();

      adapter.dispose();
      target.dispatch("online");
      target.dispatch("online");

      expect(schedulerHandle.flushNow).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 7 — concurrency invariant delegated to scheduler
  // ─────────────────────────────────────────────────────────────

  describe("concurrency invariant delegated to scheduler", () => {
    it("forwards every event call to flushNow without adapter-side de-dup", () => {
      // The adapter intentionally does NOT track in-flight state.
      // Pinning this contract prevents a future change that
      // accidentally adds a second concurrency layer (would
      // double-guard against the scheduler's own merge).
      const { target, schedulerHandle } = makeAdapter();

      // Hold the scheduler's flushNow Promise open.
      let resolveFlush: (result: SyncEnginePushResult) => void = () => {
        throw new Error("flushNow not awaited");
      };
      schedulerHandle.flushNow.mockImplementationOnce(
        () =>
          new Promise<SyncEnginePushResult>((resolve) => {
            resolveFlush = resolve;
          }),
      );

      target.dispatch("online");
      target.dispatch("online");
      target.dispatch("online");

      // Adapter calls flushNow once per event — the scheduler is
      // responsible for merging overlapping calls into a single tick.
      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(3);

      resolveFlush({
        drained: 0,
        pushed: 0,
        retried: 0,
        rejected: 0,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Group 8 — interaction with stopped scheduler
  // ─────────────────────────────────────────────────────────────

  describe("interaction with stopped scheduler", () => {
    it("calls flushNow even when the scheduler is stopped (per scheduler contract)", () => {
      // The scheduler contract (PR #042e-scheduler) allows flushNow
      // before/without start(). The adapter does not consult
      // isRunning() because that would create a class of bug where
      // a flush triggered by going-online is silently dropped just
      // because the scheduler hasn't been started yet (e.g., during
      // an out-of-order boot path).
      const { target, schedulerHandle } = makeAdapter();
      // Stub returns a result; we don't touch isRunning here.
      target.dispatch("online");

      expect(schedulerHandle.flushNow).toHaveBeenCalledTimes(1);
    });
  });
});
