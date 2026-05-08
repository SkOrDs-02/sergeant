import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { capturePostHogEvent } from "../observability/posthog";
import { useFlag } from "../lib/featureFlags";
import { hasPinSet, verifyPin } from "./lockStorage";

export type LockState = "idle" | "locked" | "setup" | "change";

// How long (ms) without pointer/keyboard activity before auto-lock.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface UseAppLockReturn {
  state: LockState;
  /** Begin the PIN-setup flow (called by PrivacySection when enabling lock). */
  startSetup: () => void;
  /** Begin the change-PIN flow (called by PrivacySection). */
  startChange: () => void;
  /** Called by AppLock when the user submits a PIN in the unlock screen. */
  unlock: (pin: string) => Promise<boolean>;
  /** Called after setup/change is complete. */
  finishSetup: () => void;
  /** Force-lock immediately (e.g. from PrivacySection "Lock now"). */
  lock: () => void;
}

export function useAppLock(): UseAppLockReturn {
  const enabled = useFlag("app-lock-enabled");
  const [state, setState] = useState<LockState>("idle");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupModeRef = useRef<"setup" | "change">("setup");

  // On mount (and whenever the flag is toggled on) check if a PIN is already
  // configured — if yes, lock immediately (cold-start protection).
  useEffect(() => {
    if (!enabled) {
      setState("idle");
      return;
    }
    let cancelled = false;
    hasPinSet().then((has) => {
      if (!cancelled && has) setState("locked");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // visibilitychange → lock when tab returns to foreground while a PIN is set.
  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      hasPinSet().then((has) => {
        if (has) setState("locked");
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled]);

  // Idle timer — reset on any user interaction; lock after IDLE_TIMEOUT_MS.
  const resetIdleTimer = useCallback(() => {
    if (!enabled) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      hasPinSet().then((has) => {
        if (has) setState("locked");
      });
    }, IDLE_TIMEOUT_MS);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const events: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => document.addEventListener(e, resetIdleTimer, true));
    resetIdleTimer();
    return () => {
      events.forEach((e) =>
        document.removeEventListener(e, resetIdleTimer, true),
      );
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [enabled, resetIdleTimer]);

  const lock = useCallback(() => {
    setState("locked");
  }, []);

  const startSetup = useCallback(() => {
    setupModeRef.current = "setup";
    setState("setup");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_STARTED, {
      mode: "setup",
    });
  }, []);

  const startChange = useCallback(() => {
    setupModeRef.current = "change";
    setState("change");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_STARTED, {
      mode: "change",
    });
  }, []);

  const finishSetup = useCallback(() => {
    const mode = setupModeRef.current;
    setState("idle");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_COMPLETED, { mode });
  }, []);

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      const ok = await verifyPin(pin);
      if (ok) {
        setState("idle");
        capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_SUCCESS, {});
        resetIdleTimer();
      } else {
        capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_FAILED, {});
      }
      return ok;
    },
    [resetIdleTimer],
  );

  return { state, startSetup, startChange, unlock, finishSetup, lock };
}
