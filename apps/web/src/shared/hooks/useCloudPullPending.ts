import { useSyncExternalStore } from "react";
import {
  getCloudPullPending,
  subscribeCloudPullPending,
} from "@shared/lib/modules/cloudPullRequest";

/**
 * Reactive boolean signal: `true` while at least one `requestCloudPull()`
 * call is currently in flight (awaiting `PULL_COMPLETE_EVENT` or timeout).
 *
 * Wire into `<PullToRefresh enabled={!cloudPullPending}>` so a second
 * pull gesture doesn't re-fire `requestCloudPull` while the previous one
 * is still settling — that was the race documented in
 * `docs/audits/2026-05-13-web-frontend-ergonomics-roast.md` § F6.
 */
export function useCloudPullPending(): boolean {
  return useSyncExternalStore(
    subscribeCloudPullPending,
    getCloudPullPending,
    getCloudPullPendingServer,
  );
}

function getCloudPullPendingServer(): boolean {
  return false;
}
