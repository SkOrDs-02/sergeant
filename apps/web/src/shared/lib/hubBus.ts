/**
 * Typed in-process pub/sub for hub-level UI signals.
 *
 * Replaces `window.dispatchEvent(new CustomEvent("hub:openChat", …))` and
 * the matching `window.addEventListener("hub:openChat", …)` pair. Two
 * problems with the legacy `window` channel:
 *
 *  1. **Untyped detail.** Each emit-site hand-rolled its own payload
 *     shape — some sent a bare string, some sent `{ message, autoSend }`,
 *     and the listener had to runtime-narrow with `typeof detail === ...`.
 *     Drifts go unnoticed until they hit production.
 *  2. **Implicit global surface.** Anything on the page (extensions,
 *     embedded iframes, third-party scripts) can dispatch a `hub:openChat`
 *     and force the chat open. The typed bus is a module-scoped Map, not
 *     a `window` event, so only first-party code can publish.
 *
 * Mobile shell deep-links still go through `HUB_OPEN_MODULE_EVENT` on
 * `window` — that's a deliberate cross-realm bridge between the WebView
 * and the React app. This bus only replaces the in-app `hub:openChat` /
 * `hub:openSearch` signalling.
 *
 * The implementation is intentionally tiny (~30 LOC of hot path) and
 * dependency-free; React subscriptions are exposed via `useHubBus` so
 * components can subscribe with the standard `useSyncExternalStore`
 * semantics handled internally via `useEffect`.
 */

import { useEffect } from "react";

export interface HubBusEvents {
  /**
   * Open the assistant chat panel.
   *
   * - `message`: prompt to seed the chat input. `null` ⇒ open with empty
   *   composer (e.g. user clicked the floating chat button).
   * - `autoSend`: if `true`, the assistant immediately sends the message
   *   without waiting for the user to confirm. Defaults to `false` for
   *   safety (user retains the chance to edit).
   */
  openChat: { message: string | null; autoSend?: boolean };
  /** Open the global Hub search overlay (⌘K equivalent). */
  openSearch: void;
}

type Handler<K extends keyof HubBusEvents> = (detail: HubBusEvents[K]) => void;

// Single map of event-name → Set<handler>. The handler types differ per
// key, but in storage we erase to `Handler<keyof HubBusEvents>`; the
// per-key `getSet`/`emitHubBus`/`onHubBus` boundaries restore the
// invariant that each set only contains handlers for its own key.
type AnyHandler = Handler<keyof HubBusEvents>;

const subscribers = new Map<keyof HubBusEvents, Set<AnyHandler>>();

function getSet<K extends keyof HubBusEvents>(event: K): Set<Handler<K>> {
  let set = subscribers.get(event);
  if (!set) {
    set = new Set();
    subscribers.set(event, set);
  }
  return set as Set<Handler<K>>;
}

/**
 * Publish a typed event to all current subscribers. Synchronous — the
 * call returns only after every handler has run. Errors thrown by one
 * subscriber don't prevent the rest from receiving the event; they are
 * re-thrown asynchronously via `setTimeout(0)` so a single buggy
 * listener can't break the publishing site.
 */
export function emitHubBus<K extends keyof HubBusEvents>(
  event: K,
  detail: HubBusEvents[K],
): void {
  const set = subscribers.get(event) as Set<Handler<K>> | undefined;
  if (!set || set.size === 0) return;
  set.forEach((handler) => {
    try {
      handler(detail);
    } catch (err) {
      setTimeout(() => {
        throw err;
      }, 0);
    }
  });
}

/**
 * Imperatively subscribe to a typed event. Returns an unsubscribe
 * function. Most consumers should use `useHubBus` instead — this
 * lower-level API is exposed for non-React contexts and tests.
 */
export function onHubBus<K extends keyof HubBusEvents>(
  event: K,
  handler: Handler<K>,
): () => void {
  const set = getSet(event);
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

/**
 * React hook: subscribe to a typed hub bus event for the lifetime of
 * the component. The handler must be stable (memoised) — re-renders
 * that produce a fresh handler identity will detach and re-attach,
 * which is fine but wasteful.
 */
export function useHubBus<K extends keyof HubBusEvents>(
  event: K,
  handler: Handler<K>,
): void {
  useEffect(() => onHubBus(event, handler), [event, handler]);
}

/** Test-only: drop every subscriber. Do not call from production code. */
export function __resetHubBusForTests(): void {
  subscribers.clear();
}
