import { useEffect, useRef } from "react";
import { rawRemoveItem } from "../enqueue";
import { clearSyncManagedData } from "../state/moduleData";
import type { CurrentUser } from "../types";

/**
 * Runs `runInitialSync` exactly once per signed-in user. On user change,
 * wipes the previous user's sync-managed localStorage slice and calls
 * `onUserChanged` (used to reset migration-pending UI state).
 *
 * Reserves the "already synced" slot before awaiting so concurrent renders
 * don't fire a second initialSync for the same user. If the run fails
 * (network, 5xx, `ApiError`), releases the slot so the next render — or a
 * subsequent user-change effect — can retry. Without this, a transient
 * failure on the very first sign-in would leave the app in a permanently
 * "initial-synced" state with no cloud reconciliation until page reload.
 */
export function useInitialSyncOnUser(
  user: CurrentUser | null | undefined,
  runInitialSync: () => Promise<boolean>,
  onUserChanged: () => void,
): void {
  const didInitialSync = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid !== lastUserId.current) {
      if (lastUserId.current !== null) {
        clearSyncManagedData(rawRemoveItem);
      }
      didInitialSync.current = false;
      lastUserId.current = uid;
      onUserChanged();
    }
    if (!user || didInitialSync.current) return;

    didInitialSync.current = true;
    const uidAtStart = user.id;
    runInitialSync().then((ok) => {
      if (ok) return;
      // Only clear the flag if the user is still the same — a user change
      // will reset it anyway and we must not race that reset.
      if (lastUserId.current === uidAtStart) {
        didInitialSync.current = false;
      }
    });
  }, [user, runInitialSync, onUserChanged]);
}
