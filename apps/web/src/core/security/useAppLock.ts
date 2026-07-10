import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { capturePostHogEvent } from "../observability/posthog";
import { useFlag } from "../lib/featureFlags";
import { useAuth } from "../auth/AuthContext";
import {
  clearPinHash,
  hasPinSet,
  savePinHash,
  verifyPinAttempt,
} from "./lockStorage";

export type LockState = "idle" | "locked" | "setup" | "change";

// How long (ms) without pointer/keyboard activity before auto-lock.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Audit F15: мінімальний gap між перепланованнями idle-таймера. Швидкий
// скрол шле десятки подій за секунду — без throttle вони jankifyять
// main-thread, не змінюючи ефективну auto-lock поведінку.
const IDLE_RESET_THROTTLE_MS = 1000;

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
  /**
   * Persist a new PIN hash scoped to the current user (audit F16). Called
   * by the `AppLock` setup/change flow so the credential lands in the
   * signed-in user's partition, not `anon`.
   */
  savePin: (pin: string) => Promise<void>;
  /** Whether the current user has a PIN configured (called by PrivacySection). */
  hasPin: () => Promise<boolean>;
  /**
   * Clear the current user's PIN credential (called by PrivacySection when
   * disabling the lock). Scoped to `user?.id` so the right slot is wiped.
   */
  disablePin: () => Promise<void>;
}

export function useAppLock(): UseAppLockReturn {
  const enabled = useFlag("app-lock-enabled");
  // Audit F16: the credential store is partitioned per Better-Auth user id.
  // Resolve it once here so every storage call below — and the closures we
  // hand to `AppLock` / `PrivacySection` — target the right partition.
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [internalState, setInternalState] = useState<LockState>("idle");
  const state = enabled ? internalState : "idle";
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdleResetRef = useRef(0);
  const setupModeRef = useRef<"setup" | "change">("setup");

  // On mount (and whenever the flag is toggled on) check if a PIN is already
  // configured — if yes, lock immediately (cold-start protection).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    hasPinSet(userId).then((has) => {
      if (!cancelled && has) setInternalState("locked");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  // visibilitychange → lock when tab returns to foreground while a PIN is set.
  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      hasPinSet(userId).then((has) => {
        if (has) setInternalState("locked");
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, userId]);

  // Idle timer — reset on any user interaction; lock after IDLE_TIMEOUT_MS.
  // Throttled by IDLE_RESET_THROTTLE_MS so capture-phase scroll/pointer
  // floods do not thrash main-thread rescheduling setTimeout (audit F15).
  const resetIdleTimer = useCallback(() => {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastIdleResetRef.current < IDLE_RESET_THROTTLE_MS) return;
    lastIdleResetRef.current = now;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      hasPinSet(userId).then((has) => {
        if (has) setInternalState("locked");
      });
    }, IDLE_TIMEOUT_MS);
  }, [enabled, userId]);

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
    setInternalState("locked");
  }, []);

  const startSetup = useCallback(() => {
    setupModeRef.current = "setup";
    setInternalState("setup");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_STARTED, {
      mode: "setup",
    });
  }, []);

  const startChange = useCallback(() => {
    setupModeRef.current = "change";
    setInternalState("change");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_STARTED, {
      mode: "change",
    });
  }, []);

  const finishSetup = useCallback(() => {
    const mode = setupModeRef.current;
    setInternalState("idle");
    capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_SETUP_COMPLETED, { mode });
  }, []);

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      const result = await verifyPinAttempt(pin, userId);
      if (result.ok) {
        setInternalState("idle");
        capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_SUCCESS, {
          method: "pin",
        });
        // Force-reset throttle window so resetIdleTimer runs immediately
        // to arm post-unlock idle timer (audit F15).
        lastIdleResetRef.current = 0;
        resetIdleTimer();
        return true;
      }
      capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_FAILED, {
        method: "pin",
        attempt: result.failed,
        wiped: result.wiped,
      });
      if (result.wiped) {
        // Decision #4 / 10-attempt wipe: credential was nuked. Drop the
        // lock so the user gets back into the app — Settings shows the
        // un-configured state and they must re-enroll. The single
        // `APP_LOCK_UNLOCK_FAILED` event above already carries
        // `wiped: true`, so dashboards filter on it without aggregating
        // a duplicate event.
        setInternalState("idle");
      }
      return false;
    },
    [resetIdleTimer, userId],
  );

  // Audit F16 closures — bind the storage helpers to the resolved `userId`
  // so consumers (`AppLock` setup flow, `PrivacySection`) never have to
  // know the partitioning scheme or import `lockStorage` themselves.
  const savePin = useCallback(
    (pin: string) => savePinHash(pin, userId),
    [userId],
  );
  const hasPin = useCallback(() => hasPinSet(userId), [userId]);
  const disablePin = useCallback(() => clearPinHash(userId), [userId]);

  return {
    state,
    startSetup,
    startChange,
    unlock,
    finishSetup,
    lock,
    savePin,
    hasPin,
    disablePin,
  };
}
