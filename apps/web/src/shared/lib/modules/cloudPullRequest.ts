/**
 * Cross-module bridge for historical "user requested a fresh pull" events.
 *
 * The CloudSync v1 pull engine is gone, but older module pull-to-refresh
 * surfaces still dispatch this window event. App-level compatibility code
 * immediately emits `PULL_COMPLETE_EVENT` so those requesters can resolve
 * their promises and unwind spinners without hitting legacy endpoints.
 *
 * The flow is intentionally fire-and-forget with a short timeout so the
 * pull-to-refresh spinner never sticks. If the App-level listener is not
 * mounted, the promise resolves after the timeout and the UI carries on.
 *
 * In addition to dispatching events, this module maintains an in-process
 * pending counter so UI surfaces (e.g. `<PullToRefresh>`) can subscribe
 * to "any cloud-pull currently in flight" and disable double-triggers.
 * Subscribe via `subscribeCloudPullPending` / snapshot via
 * `getCloudPullPending`; the React-side wrapper lives in
 * `@shared/hooks/useCloudPullPending`.
 */

export const REQUEST_PULL_EVENT = "sergeant:request-pull";
export const PULL_COMPLETE_EVENT = "sergeant:pull-complete";

const DEFAULT_TIMEOUT_MS = 4000;

let pendingCount = 0;
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  pendingListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      setTimeout(() => {
        throw err;
      }, 0);
    }
  });
}

/**
 * Subscribe to changes in the "any cloud-pull in flight" boolean. Returns
 * an unsubscribe function. Designed for `useSyncExternalStore`.
 */
export function subscribeCloudPullPending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/**
 * Current snapshot of "any cloud-pull in flight". `true` while at least
 * one `requestCloudPull()` call is awaiting completion or timeout.
 */
export function getCloudPullPending(): boolean {
  return pendingCount > 0;
}

/**
 * Ask the App-level compatibility listener to settle a historical pull
 * request. Resolves on `PULL_COMPLETE_EVENT` or after `timeoutMs`.
 */
export function requestCloudPull(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  pendingCount += 1;
  notifyPendingListeners();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PULL_COMPLETE_EVENT, finish);
      pendingCount = Math.max(0, pendingCount - 1);
      notifyPendingListeners();
      resolve();
    };
    window.addEventListener(PULL_COMPLETE_EVENT, finish, { once: true });
    window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * Notify pending requesters that the compatibility pull request settled.
 */
export function emitCloudPullComplete(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
}

/** Test-only: reset internal pending counter + listener set. */
export function __resetCloudPullPendingForTests(): void {
  pendingCount = 0;
  pendingListeners.clear();
}
