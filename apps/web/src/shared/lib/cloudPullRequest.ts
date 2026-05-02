/**
 * Cross-module bridge for "user requested a fresh pull from cloud-sync".
 *
 * `useCloudSync` lives at the App-level (single sync engine). Modules that
 * surface a pull-to-refresh gesture (Finyk Transactions, Fizruk Workouts,
 * Routine, Nutrition) cannot call `pullAll()` directly without spawning a
 * second sync engine — so they dispatch a window event and the App-level
 * listener performs the actual `sync.pullAll()`. The App dispatches a
 * follow-up `PULL_COMPLETE_EVENT` so the requester can resolve its
 * promise and unwind the spinner.
 *
 * The flow is intentionally fire-and-forget with a short timeout so the
 * pull-to-refresh spinner never sticks — if the App-level listener is
 * not mounted (e.g. a Storybook screen), the promise resolves after the
 * timeout and the UI carries on.
 */

export const REQUEST_PULL_EVENT = "sergeant:request-pull";
export const PULL_COMPLETE_EVENT = "sergeant:pull-complete";

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Ask the App-level cloud-sync engine to perform a pull. Resolves when
 * the engine fires `PULL_COMPLETE_EVENT` or after `timeoutMs` (so the
 * caller's spinner never hangs forever).
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
 * Notify pending requesters that a pull has completed. Called by the
 * App-level listener after `sync.pullAll()` settles.
 */
export function emitCloudPullComplete(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
}
