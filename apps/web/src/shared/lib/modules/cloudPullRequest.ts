/**
 * Cross-module bridge for "user requested a fresh pull" events.
 *
 * Module pull-to-refresh surfaces dispatch `REQUEST_PULL_EVENT`; the
 * App-level listener in `core/app/useAppEffects.ts` runs a real sync v2
 * reader tick (`bootSyncEngineReader().pullOnce()`) and then emits
 * `PULL_COMPLETE_EVENT` with an outcome (`detail.ok`).
 *
 * Outcome semantics (PR-H3 tail, 2026-11-17):
 * - `ok: true` (or a bare event without detail) → the promise resolves.
 * - `ok: false` (the tick threw: offline, 5xx, …) → the promise rejects
 *   with `CloudPullError`, so `PullToRefresh` `onError` handlers show
 *   their failure toast instead of a silent "success".
 * - No completion before `timeoutMs` → the promise RESOLVES. A timeout is
 *   not proof of failure: the listener may be unmounted (tests, isolated
 *   routes) or the tick is just slow and keeps running in the background.
 *   Its job is only to unwind the spinner; a real failure still arrives as
 *   `ok: false` for any requester that is still waiting.
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

/** Payload of `PULL_COMPLETE_EVENT`. */
export interface CloudPullOutcome {
  ok: boolean;
}

/** Rejection reason of `requestCloudPull()` when the pull tick failed. */
export class CloudPullError extends Error {
  constructor() {
    super("Cloud pull failed");
    this.name = "CloudPullError";
  }
}

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
 * Ask the App-level listener to run a pull tick. Resolves on a successful
 * `PULL_COMPLETE_EVENT` or after `timeoutMs`; rejects with
 * `CloudPullError` when the completion event reports `ok: false`.
 */
export function requestCloudPull(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  pendingCount += 1;
  notifyPendingListeners();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: number | undefined;
    const finish = (failed: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PULL_COMPLETE_EVENT, onComplete);
      if (timer !== undefined) window.clearTimeout(timer);
      pendingCount = Math.max(0, pendingCount - 1);
      notifyPendingListeners();
      if (failed) reject(new CloudPullError());
      else resolve();
    };
    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<CloudPullOutcome | null>).detail;
      finish(detail?.ok === false);
    };
    window.addEventListener(PULL_COMPLETE_EVENT, onComplete, { once: true });
    window.dispatchEvent(new Event(REQUEST_PULL_EVENT));
    if (!settled) timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Notify pending requesters that the pull tick settled. `ok: false`
 * rejects every waiting `requestCloudPull()` promise.
 */
export function emitCloudPullComplete(
  outcome: CloudPullOutcome = { ok: true },
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CloudPullOutcome>(PULL_COMPLETE_EVENT, { detail: outcome }),
  );
}

/** Test-only: reset internal pending counter + listener set. */
export function __resetCloudPullPendingForTests(): void {
  pendingCount = 0;
  pendingListeners.clear();
}
