import type { SyncEnginePushResult } from "./syncV2.pushLoop";
import type { SyncEnginePushScheduler } from "./syncV2.pushScheduler";

/**
 * DOM-event → scheduler bridge for the client-side sync engine
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #042e-flush).
 *
 * Wraps a {@link SyncEnginePushScheduler} (PR #042e-scheduler) so a
 * DOM-event source — typically `window` — calls `scheduler.flushNow()`
 * the moment the device comes back online (or, optionally, the moment
 * the tab becomes visible again after backgrounding). Pure DI: the
 * event target is supplied by the caller, never imported, so the
 * adapter is unit-testable without a real `window` and re-usable
 * from a service worker / web-worker / `apps/mobile` shim that
 * exposes the same `addEventListener` shape.
 *
 * Why this is a separate adapter, not a method on the scheduler:
 *
 * - The scheduler owns timer state (interval handle, inflight tick).
 *   Subscribing to DOM events is a different lifetime: the user can
 *   pause the engine via `stop()` while the page is offline and
 *   still want a flush to fire when they re-connect (the `online`
 *   event would otherwise bounce off a stopped scheduler with
 *   nothing to do). Keeping subscriptions external means the boot
 *   path can compose the two pieces independently.
 * - The same DOM-event semantics will reappear in the future
 *   `pushOnEnqueue` adapter (when an `outboxEnqueue` event fires,
 *   call `scheduler.flushNow()`). Factoring out a small generic
 *   "fire on event → flushNow" bridge here pays a portion of that
 *   future cost in advance.
 *
 * Subscription contract:
 *
 * - Subscribes to one or more event names on the supplied target.
 *   `kind: 'online'` (default) listens to the standard browser
 *   `online` event. `kind: 'visible'` listens to `visibilitychange`
 *   and only fires `flushNow()` when `target.document?.visibilityState`
 *   transitions to `'visible'` (best-effort — see the
 *   `isDocumentVisible` callback below). `kind: 'both'` subscribes
 *   to both, with the same de-duplication and error policy applied
 *   uniformly across both sources.
 * - Each event handler calls `scheduler.flushNow()` and routes the
 *   resulting Promise so a rejection is captured by the optional
 *   `onFlushError` observer rather than escaping as an unhandled
 *   promise rejection. The handler does NOT `await` the Promise —
 *   the DOM event listener callback returns synchronously, the
 *   flush runs in the background.
 * - Overlapping event fires are de-duplicated by the scheduler's
 *   own concurrency guard (PR #042e-scheduler): every concurrent
 *   `flushNow()` returns the same in-flight Promise, so two
 *   `online` events 100ms apart still result in exactly one tick.
 *   This adapter does not add a second layer of de-duplication;
 *   the scheduler's invariant is enough.
 * - {@link SyncEngineFlushOnReconnect.dispose} removes every
 *   listener that was registered. Idempotent — calling `dispose()`
 *   twice is a no-op the second time.
 *
 * Error policy:
 *
 * - A rejection from `flushNow()` is reported to `onFlushError`
 *   (default no-op) and then *swallowed*. The DOM event source
 *   does not provide a retry channel, and we never want a transient
 *   sync failure to escalate into a window-level
 *   `unhandledrejection` event that could trip Sentry / surface in
 *   the user's devtools. The scheduler's periodic interval will
 *   pick up the next push on its own schedule.
 * - `onFlushError` itself is `try`/`catch`-ed inside the handler so
 *   a buggy observer cannot blow up the event listener. The wrapped
 *   throw is silently swallowed (no log) — we treat observer
 *   failures the same way Sentry's own transports do: never let an
 *   error in the error path crash the app.
 *
 * Visibility heuristic (`kind: 'visible'`):
 *
 * - Browsers fire `visibilitychange` for both directions; we only
 *   want to flush on the *appear* edge. The standard read is
 *   `document.visibilityState === 'visible'`, but `document` is not
 *   present on all targets (workers, react-native shims) and
 *   subscribing to a target that is *not* `window` should not silently
 *   short-circuit. Callers can override the visibility check via the
 *   optional `isDocumentVisible` DI; the default reads
 *   `target.document?.visibilityState === 'visible'`, gracefully
 *   reporting "appear" only when the target actually exposes a
 *   `document.visibilityState`.
 *
 * Lifetime:
 *
 * - Adapter is a one-shot — call the factory once on engine boot,
 *   keep the returned `dispose` reference, call it on engine
 *   teardown (`apps/web` `<App>` cleanup, `apps/mobile` shim
 *   teardown). Re-subscribing to the same target with a fresh
 *   factory call is supported but issues fresh listeners — the
 *   caller is responsible for disposing the previous handle.
 *
 * Tested invariants (see `syncV2.flushOnReconnect.test.ts`):
 *
 *  1. Subscription registers exactly the expected event names per
 *     `kind` (`'online'` / `'visible'` / `'both'`); fresh handler
 *     references per event so removal is exact.
 *  2. `flushNow()` is called exactly once per `online` event; the
 *     scheduler's concurrency guard de-duplicates overlapping
 *     fires (test exercises this against a stub that holds the
 *     in-flight Promise open).
 *  3. `onFlushError` is invoked when `flushNow()` rejects; the
 *     rejection does NOT bubble up as an unhandled promise.
 *  4. `onFlushError` that itself throws is swallowed (event handler
 *     returns normally; no DOM-side unhandledrejection).
 *  5. `kind: 'visible'` filters `visibilitychange` events on the
 *     `isDocumentVisible` predicate (no flush when the page is
 *     going *away*, only on the appear edge).
 *  6. `dispose()` removes every listener it added; idempotent on
 *     second call (no double-removal call).
 *  7. `kind: 'both'` subscribes to both event sources and each
 *     fires `flushNow()` independently; `dispose()` removes both.
 *  8. Subscribing while the scheduler is `stopped` still flushes —
 *     `flushNow()` does not require `start()` per the scheduler
 *     contract.
 */

/**
 * Minimal `addEventListener` / `removeEventListener` surface the
 * adapter needs. `window` (browser), `globalThis`, and `document`
 * all satisfy it; tests pass a hand-rolled stub.
 */
export interface SyncEngineEventTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: EventListenerOptions | boolean,
  ): void;
}

export type SyncEngineFlushTriggerKind = "online" | "visible" | "both";

export interface SyncEngineFlushOnReconnectDeps {
  /** DOM event source (`window` in production; stub in tests). */
  readonly target: SyncEngineEventTarget;
  /** Scheduler whose `flushNow()` will be invoked on each event. */
  readonly scheduler: Pick<SyncEnginePushScheduler, "flushNow">;
  /**
   * Optional observer fired when `flushNow()` rejects. Receives the
   * thrown value verbatim. Errors thrown by the observer itself are
   * swallowed.
   */
  readonly onFlushError?: (err: unknown) => void;
  /**
   * Optional observer fired after `flushNow()` resolves. Receives
   * the {@link SyncEnginePushResult}. Useful for telemetry /
   * Sentry breadcrumbs.
   */
  readonly onFlushComplete?: (result: SyncEnginePushResult) => void;
  /**
   * Optional predicate used by `kind: 'visible' | 'both'` to decide
   * whether a `visibilitychange` event represents the "appear" edge.
   * Default reads `target.document?.visibilityState === 'visible'`.
   * A target that does not expose `document.visibilityState` will
   * cause the default predicate to return `false` for every event,
   * effectively disabling visibility flushes on that target.
   */
  readonly isDocumentVisible?: () => boolean;
}

export interface SyncEngineFlushOnReconnectOptions {
  /**
   * Which DOM event(s) to listen for.
   *
   * - `'online'` (default): listens to `online`. Suitable for
   *   `window` in `apps/web`.
   * - `'visible'`: listens to `visibilitychange`, fires only on
   *   appear edge.
   * - `'both'`: listens to both.
   */
  readonly kind?: SyncEngineFlushTriggerKind;
}

export interface SyncEngineFlushOnReconnect {
  /**
   * Remove every listener this subscription registered. Idempotent —
   * safe to call before any event has fired and safe to double-call.
   */
  dispose(): void;
}

/**
 * Subscribe a {@link SyncEnginePushScheduler} to DOM event signals
 * that mean "the user is back". On each matching event the adapter
 * calls `scheduler.flushNow()`, routes the result through optional
 * observers, and swallows the resulting Promise so a rejection
 * cannot escape as `unhandledrejection`.
 *
 * @param deps Event target + scheduler + optional observers.
 * @param options `kind` (default `'online'`).
 */
export function createSyncEngineFlushOnReconnect(
  deps: SyncEngineFlushOnReconnectDeps,
  options: SyncEngineFlushOnReconnectOptions = {},
): SyncEngineFlushOnReconnect {
  const kind: SyncEngineFlushTriggerKind = options.kind ?? "online";

  const isDocumentVisible =
    deps.isDocumentVisible ?? defaultIsDocumentVisible(deps.target);

  const fireFlush = (): void => {
    let promise: Promise<SyncEnginePushResult>;
    try {
      promise = deps.scheduler.flushNow();
    } catch (err: unknown) {
      // flushNow() should not synchronously throw per the scheduler
      // contract, but the DI shape technically permits a sync
      // throw — guard so a buggy stub cannot blow up the listener.
      reportFlushError(deps.onFlushError, err);
      return;
    }
    promise.then(
      (result) => {
        if (deps.onFlushComplete !== undefined) {
          try {
            deps.onFlushComplete(result);
          } catch {
            // Observer faults are swallowed by design (see
            // module-level error policy above).
          }
        }
      },
      (err: unknown) => {
        reportFlushError(deps.onFlushError, err);
      },
    );
  };

  const handleOnline = (_event: Event): void => {
    fireFlush();
  };

  const handleVisibilityChange = (_event: Event): void => {
    if (!isDocumentVisible()) {
      return;
    }
    fireFlush();
  };

  const subscriptions: Array<{
    type: string;
    listener: (event: Event) => void;
  }> = [];

  if (kind === "online" || kind === "both") {
    deps.target.addEventListener("online", handleOnline);
    subscriptions.push({ type: "online", listener: handleOnline });
  }
  if (kind === "visible" || kind === "both") {
    deps.target.addEventListener("visibilitychange", handleVisibilityChange);
    subscriptions.push({
      type: "visibilitychange",
      listener: handleVisibilityChange,
    });
  }

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const { type, listener } of subscriptions) {
        deps.target.removeEventListener(type, listener);
      }
    },
  };
}

function reportFlushError(
  onFlushError: ((err: unknown) => void) | undefined,
  err: unknown,
): void {
  if (onFlushError === undefined) {
    return;
  }
  try {
    onFlushError(err);
  } catch {
    // Observer faults are swallowed — see module-level error policy.
  }
}

function defaultIsDocumentVisible(
  target: SyncEngineEventTarget,
): () => boolean {
  // `target` is a structural type; reach for `document` defensively.
  // Browsers expose it as `window.document`; workers / RN shims do
  // not, and our default predicate must return `false` (not throw)
  // in that case so the adapter degrades cleanly.
  const targetWithDoc = target as {
    readonly document?: { readonly visibilityState?: string };
  };
  return () => targetWithDoc.document?.visibilityState === "visible";
}
