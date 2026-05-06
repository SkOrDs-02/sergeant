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
 */

export const REQUEST_PULL_EVENT = "sergeant:request-pull";
export const PULL_COMPLETE_EVENT = "sergeant:pull-complete";

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Ask the App-level compatibility listener to settle a historical pull
 * request. Resolves on `PULL_COMPLETE_EVENT` or after `timeoutMs`.
 */
export function requestCloudPull(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PULL_COMPLETE_EVENT, finish);
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
