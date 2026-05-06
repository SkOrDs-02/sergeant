/**
 * NetInfo → SyncEngineEventTarget bridge.
 *
 * `createSyncEngineFlushOnReconnect` consumes a structural
 * `addEventListener('online', listener)` API, originally shaped after
 * the browser `window`. React Native has no `window.online` event;
 * the equivalent signal lives in `@react-native-community/netinfo`,
 * whose `addEventListener` callback fires on every state transition
 * with a `{ isConnected, isInternetReachable }` payload.
 *
 * This adapter:
 *   - subscribes to NetInfo lazily on the first `addEventListener('online', …)`
 *   - tracks the last known connected state so we only fan out
 *     `online` events on the offline → online edge (matches the
 *     `window.online` semantics)
 *   - dispatches a synthetic `Event` shape compatible with
 *     `flushOnReconnect`'s `(event: Event) => void` listener type
 *   - tears down the NetInfo subscription when the last listener
 *     unsubscribes, so the bridge is a no-op cost when the writer
 *     runtime is stopped
 *
 * Anything other than `'online'` is silently ignored — RN has no
 * `visibilitychange`, and the writer factory in
 * `apps/mobile/src/core/syncEngine/syncEngineWriter.ts` always passes
 * `kind: 'online'` (see {@link createSyncEngineWriterRuntime}). We
 * still implement `removeEventListener` for unsupported types so
 * the structural contract holds.
 *
 * @see apps/web/src/core/syncEngine/syncEngineWriter.ts
 * @see packages/api-client/src/endpoints/syncV2.flushOnReconnect.ts
 */
import type { SyncEngineEventTarget } from "@sergeant/api-client";

export interface NetInfoLike {
  addEventListener(
    listener: (state: { readonly isConnected?: boolean | null }) => void,
  ): () => void;
}

export interface NetInfoEventTargetOptions {
  /**
   * Optional override for the initial connectivity assumption.
   * Defaults to `true` so the very first NetInfo callback only
   * fires `online` if the device starts offline and recovers.
   *
   * Tests pass `false` to verify the offline → online edge.
   */
  readonly initialOnline?: boolean;
}

interface NetInfoBackedEventTarget extends SyncEngineEventTarget {
  /**
   * Disposes the underlying NetInfo subscription and clears every
   * registered listener. Idempotent; safe to call from
   * `runtime.stop()` even when no listeners ever registered.
   */
  dispose(): void;
}

export function createNetInfoEventTarget(
  netInfo: NetInfoLike,
  options: NetInfoEventTargetOptions = {},
): NetInfoBackedEventTarget {
  const onlineListeners = new Set<(event: Event) => void>();
  let lastOnline: boolean = options.initialOnline ?? true;
  let unsubscribe: (() => void) | null = null;

  const ensureSubscription = (): void => {
    if (unsubscribe !== null) return;
    unsubscribe = netInfo.addEventListener((state) => {
      const nextOnline = state.isConnected === true;
      // Only fan out on the offline → online edge to mirror the
      // browser `window.online` semantics consumed by the
      // `flushOnReconnect` adapter.
      if (nextOnline && !lastOnline && onlineListeners.size > 0) {
        const event = makeSyntheticEvent("online");
        for (const listener of [...onlineListeners]) {
          try {
            listener(event);
          } catch {
            // Listener faults must not break sibling listeners or
            // the NetInfo subscription itself. The listener owns
            // its own error reporting (the writer runtime forwards
            // through `captureException`).
          }
        }
      }
      lastOnline = nextOnline;
    });
  };

  const teardownIfIdle = (): void => {
    if (onlineListeners.size === 0 && unsubscribe !== null) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  return {
    addEventListener(
      type: string,
      listener: (event: Event) => void,
      _options?: AddEventListenerOptions | boolean,
    ): void {
      if (type !== "online") return;
      onlineListeners.add(listener);
      ensureSubscription();
    },
    removeEventListener(
      type: string,
      listener: (event: Event) => void,
      _options?: EventListenerOptions | boolean,
    ): void {
      if (type !== "online") return;
      onlineListeners.delete(listener);
      teardownIfIdle();
    },
    dispose(): void {
      onlineListeners.clear();
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}

function makeSyntheticEvent(type: string): Event {
  // Modern Hermes (RN ≥ 0.74) and the Node ≥ 18 runtime that
  // jest-expo runs tests on both expose the standard `Event`
  // constructor on `globalThis` — prefer it so the synthetic payload
  // matches the structural shape `flushOnReconnect` declares.
  const ctor = (globalThis as { Event?: new (type: string) => Event }).Event;
  if (typeof ctor === "function") {
    return new ctor(type);
  }
  // Older Hermes builds have no `Event` constructor. The
  // `flushOnReconnect` adapter only inspects the event for its
  // `type` (and only for `visibilitychange` flows, which we do not
  // emit), so a duck-typed payload is sufficient for the on-line
  // edge. `Object.create(null)` returns `any`, so the `Event`
  // assignment is permitted without an explicit double-cast.
  const synthetic: { type: string } = Object.create(null);
  synthetic.type = type;
  return synthetic as Event;
}
