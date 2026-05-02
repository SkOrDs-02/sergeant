import { useEffect, useRef } from "react";
import type { ToastApi } from "@shared/hooks/useToast";
import type { SyncError } from "../types";

/**
 * How long the retry-toast stays on screen. Slightly longer than the
 * default error toast (5 s) because the user has to make a decision —
 * retry now or accept the queued state.
 */
export const SYNC_ERROR_TOAST_DURATION_MS = 8000;

/**
 * Translate a normalized `SyncError` into the Ukrainian copy the user sees
 * in the toast. Kept as a pure helper so unit tests can lock the strings
 * without spinning up React.
 *
 * `network`            → "перевір з'єднання" (the device thinks it has
 *                        signal but the request itself failed — e.g. flaky
 *                        Wi-Fi). When `navigator.onLine === false` the
 *                        hook below skips the toast entirely so this copy
 *                        only appears for "online but unreachable" cases.
 * `server` retryable   → 5xx → invite a retry.
 * `server` non-retry   → 4xx / parse → no retry CTA, ask user to check input.
 * `unknown`            → unexpected; no retry CTA.
 */
export function userFacingSyncErrorMessage(detail: SyncError): string {
  switch (detail.type) {
    case "network":
      return "Не вдалось синхронізувати — перевір з'єднання.";
    case "server":
      return detail.retryable
        ? "Сервер тимчасово не відповідає. Спробуй ще раз."
        : "Помилка синхронізації. Передивись введення.";
    default:
      return "Помилка синхронізації.";
  }
}

/**
 * Surfaces cloud-sync failures via the global toast queue.
 *
 * Fires once per error transition: when `syncErrorDetail` flips from
 * `null` to a non-null value, or when its message changes between two
 * successive failures. When the error is `retryable` the toast carries
 * a "Спробувати ще" CTA that calls `onRetry` — wire `useCloudSync().pushAll`
 * to it so a user-driven retry replays the queued changes.
 *
 * Suppresses the toast while the device is offline: `OfflineBanner` already
 * owns that signal at the top of the layout, and double-surfacing the same
 * fact would just stack two competing messages. The next failure after the
 * device comes back online still fires.
 *
 * Re-firing rules:
 *   - `null → SyncError`             → fire.
 *   - `SyncError(msgA) → SyncError(msgB)` (msgB ≠ msgA)
 *                                     → dismiss old, fire new.
 *   - `SyncError(msgA) → SyncError(msgA)` (same message twice)
 *                                     → no-op (avoids spam during retry loops).
 *   - `SyncError → null`              → no-op; reset internal de-dup so the
 *                                       next failure can fire again.
 */
export function useSyncErrorToast(
  syncErrorDetail: SyncError | null,
  toast: ToastApi,
  onRetry: () => void,
): void {
  const lastShownMessageRef = useRef<string | null>(null);
  const activeToastIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!syncErrorDetail) {
      lastShownMessageRef.current = null;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (lastShownMessageRef.current === syncErrorDetail.message) return;

    if (activeToastIdRef.current !== null) {
      toast.dismiss(activeToastIdRef.current);
      activeToastIdRef.current = null;
    }

    lastShownMessageRef.current = syncErrorDetail.message;
    activeToastIdRef.current = toast.error(
      userFacingSyncErrorMessage(syncErrorDetail),
      SYNC_ERROR_TOAST_DURATION_MS,
      syncErrorDetail.retryable
        ? { label: "Спробувати ще", onClick: onRetry }
        : undefined,
    );
  }, [syncErrorDetail, toast, onRetry]);
}
