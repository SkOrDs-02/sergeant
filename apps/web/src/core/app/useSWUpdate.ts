import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@shared/hooks/useToast";
import { isHubStreaming } from "../hub/streamingStore";

declare global {
  interface Window {
    __pwaUpdateSW?: (reloadPage?: boolean) => void;
    __pwaUpdateReady?: boolean;
  }
}

/**
 * Maximum time (ms) we will defer showing the PWA update-prompt even
 * if Hub streaming or mutations are still in-flight. After this wall-
 * clock deadline the prompt is shown unconditionally so the app can
 * never be "bricked" by a stuck streaming flag (R5 mitigation).
 */
const HARD_SHOW_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

/**
 * How often we poll to see whether Hub has gone idle after an update
 * was detected but deferred.
 */
const IDLE_POLL_INTERVAL_MS = 1_000; // 1 second

/** Returns true when there are any mutations currently running. */
function hasMutationsInFlight(
  getMutationCache: () => { getAll(): Array<{ state: { status: string } }> },
): boolean {
  return getMutationCache()
    .getAll()
    .some((m) => m.state.status === "pending");
}

export function useSWUpdate() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Tracks whether we have already shown (or are about to show) the
  // update toast so we never fire it twice.
  const toastShownRef = useRef(false);

  // When an update is detected but deferred (Hub busy), this holds the
  // wall-clock timestamp at which the update was first detected. Used to
  // enforce the hard 10-minute show deadline.
  const updateDetectedAtRef = useRef<number | null>(null);

  // Refs forwarded into effects so callbacks are always up-to-date
  // without re-registering event listeners on every render.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const applyUpdate = useCallback(() => {
    if (typeof window.__pwaUpdateSW === "function") {
      window.__pwaUpdateSW(true);
    } else {
      window.location.reload();
    }
  }, []);

  // Stored in a ref so the poll interval can reference the latest version
  // without re-subscribing.
  const applyUpdateRef = useRef(applyUpdate);
  applyUpdateRef.current = applyUpdate;

  useEffect(() => {
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function showUpdateToast() {
      if (toastShownRef.current) return;
      toastShownRef.current = true;

      // Clean up deferral timers — we are showing now.
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (hardTimeoutId !== null) {
        clearTimeout(hardTimeoutId);
        hardTimeoutId = null;
      }

      toastRef.current.info("Доступна нова версія", 15000, {
        label: "Оновити",
        onClick: applyUpdateRef.current,
      });
    }

    /**
     * Attempt to show the update toast. If Hub is streaming or mutations
     * are in-flight, schedule a polling interval to retry every second.
     * A hard 10-minute timeout ensures the prompt is eventually shown
     * regardless of Hub activity (R5 mitigation).
     */
    function scheduleOrShowUpdateToast() {
      if (toastShownRef.current) return;

      const detectedAt = (updateDetectedAtRef.current ??= Date.now());
      const msSinceDetected = Date.now() - detectedAt;

      const isBusy =
        isHubStreaming() ||
        hasMutationsInFlight(() => queryClientRef.current.getMutationCache());

      if (!isBusy || msSinceDetected >= HARD_SHOW_TIMEOUT_MS) {
        // Either Hub is idle, or we have waited long enough — show now.
        showUpdateToast();
        return;
      }

      // Hub is busy. Start polling if we haven't already.
      if (pollIntervalId === null) {
        pollIntervalId = setInterval(() => {
          if (toastShownRef.current) {
            clearInterval(pollIntervalId!);
            pollIntervalId = null;
            return;
          }
          const elapsed =
            Date.now() - (updateDetectedAtRef.current ?? Date.now());
          const stillBusy =
            isHubStreaming() ||
            hasMutationsInFlight(() =>
              queryClientRef.current.getMutationCache(),
            );

          if (!stillBusy || elapsed >= HARD_SHOW_TIMEOUT_MS) {
            showUpdateToast();
          }
        }, IDLE_POLL_INTERVAL_MS);
      }

      // Hard-timeout failsafe (R5): force-show after 10 minutes.
      if (hardTimeoutId === null) {
        const remaining = HARD_SHOW_TIMEOUT_MS - msSinceDetected;
        hardTimeoutId = setTimeout(
          () => {
            hardTimeoutId = null;
            showUpdateToast();
          },
          Math.max(0, remaining),
        );
      }
    }

    const onUpdate = () => {
      setUpdateAvailable(true);
      scheduleOrShowUpdateToast();
    };

    const onOffline = () => {
      toastRef.current.success("Додаток готовий до роботи офлайн", 4000);
    };

    if (window.__pwaUpdateReady) {
      setUpdateAvailable(true);
      scheduleOrShowUpdateToast();
    }

    window.addEventListener("pwa-update-ready", onUpdate);
    window.addEventListener("pwa-offline-ready", onOffline);

    return () => {
      window.removeEventListener("pwa-update-ready", onUpdate);
      window.removeEventListener("pwa-offline-ready", onOffline);
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      if (hardTimeoutId !== null) clearTimeout(hardTimeoutId);
    };
  }, []);
  // Intentionally empty deps: the effect installs once at mount and all
  // dynamic values (toast, queryClient, applyUpdate) are forwarded via
  // refs to avoid re-registering the event listeners on every render.

  return { updateAvailable, applyUpdate };
}
