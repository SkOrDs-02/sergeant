import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { capturePostHogEvent } from "../observability/posthog";
import { useAuth } from "../auth/AuthContext";
import { setFlag } from "../lib/featureFlags";
import {
  clearPinHash,
  hasPinSet,
  readLockStatus,
  savePinHash,
  verifyPinAttempt,
  type LockStatus,
} from "./lockStorage";

/**
 * `checking` — холодний старт: наявність PIN-креденшела ще не перевірена
 * (IndexedDB + розв'язання користувача). `AppLock` у цьому стані закриває
 * екран непрозорою завісою, щоб дані не блимнули до екрана PIN (priv-03).
 *
 * `lockedOut` — вичерпано ліміт хибних PIN (sec-12/priv-14): замок НЕ
 * знімається, цифрова панель не показується, лишається тільки вихід з акаунта.
 */
export type LockState =
  "checking" | "idle" | "locked" | "lockedOut" | "setup" | "change";

/**
 * Стани, у яких приватний контент не має бути в DOM (sec-13, priv-15):
 * екран PIN або вичерпаний ліміт. `checking` сюди не входить: його вже
 * закриває непрозора завіса, а гейт на ньому відклав би перший кадр усім
 * користувачам без PIN. `setup`/`change` теж ні: людина вже в застосунку й
 * сама налаштовує PIN з екрана налаштувань, який не можна зносити під нею.
 */
export function isPrivateContentHidden(state: LockState): boolean {
  return state === "locked" || state === "lockedOut";
}

function lockedStateOf(status: LockStatus): LockState {
  return status.lockedOut ? "lockedOut" : "locked";
}

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
  /**
   * Epoch ms, до якого нові спроби PIN відхиляються (наростаюча пауза після
   * 5-ї невдачі), або `null`, якщо паузи нема.
   */
  retryAt: number | null;
  /**
   * Вийти з акаунта з екрана замка («Забув PIN?» і стан `lockedOut`). Після
   * ПІДТВЕРДЖЕНОГО виходу стирає PIN-креденшел вийденого користувача, тож
   * далі потрібен пароль акаунта. `false` — вихід скасовано (діалог про
   * незбережені записи); тоді креденшел і замок лишаються як були.
   */
  signOut: () => Promise<boolean>;
  /** Гість без акаунта: «вихід» стирає локальні дані. */
  isGuest: boolean;
}

export function useAppLock(): UseAppLockReturn {
  // Audit F16: the credential store is partitioned per Better-Auth user id.
  // Resolve it once here so every storage call below — and the closures we
  // hand to `AppLock` / `PrivacySection` — target the right partition.
  const { user, status, logout } = useAuth();
  const userId = user?.id ?? null;
  // Поки сесія не розв'язалась, `userId === null` ще не означає «анонім»:
  // PIN залогіненого лежить у ЙОГО партиції, тож перевірку відкладаємо.
  const authLoading = status === "loading";
  const [state, setState] = useState<LockState>("checking");
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdleResetRef = useRef(0);
  const setupModeRef = useRef<"setup" | "change">("setup");

  // Cold-start: блокуємо за НАЯВНІСТЮ креденшела, а не за прапорцем
  // `app-lock-enabled` (priv-03). Прапорець лежить у SQLite kv і на першому
  // рендері (до буту) читається з порожнього localStorage; захист не має
  // залежати від того, чи встиг він доїхати. `disablePin` стирає хеш, тож
  // «PIN є» рівнозначне «блокування ввімкнене». До завершення перевірки стан
  // `checking` (див. `AppLock`) не показує дані.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    readLockStatus(userId)
      .then((lockStatus) => {
        if (cancelled) return;
        setRetryAt(
          lockStatus.retryAfterMs > 0
            ? Date.now() + lockStatus.retryAfterMs
            : null,
        );
        setState((prev) =>
          lockStatus.hasPin
            ? lockedStateOf(lockStatus)
            : prev === "checking"
              ? "idle"
              : prev,
        );
      })
      .catch(() => {
        // IndexedDB недоступна (приватний режим Safari, брак сховища):
        // PIN неможливо ні прочитати, ні перевірити — не замикаємо
        // користувача назавжди перед екраном, з якого не вийти.
        if (cancelled) return;
        setState((prev) => (prev === "checking" ? "idle" : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  // visibilitychange → lock when tab returns to foreground while a PIN is
  // set (незалежно від прапорця — див. cold-start вище).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      readLockStatus(userId)
        .then((lockStatus) => {
          if (lockStatus.hasPin) setState(lockedStateOf(lockStatus));
        })
        .catch(() => {
          /* IndexedDB недоступна — нічого блокувати */
        });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [userId]);

  // Idle timer — reset on any user interaction; lock after IDLE_TIMEOUT_MS.
  // Throttled by IDLE_RESET_THROTTLE_MS so capture-phase scroll/pointer
  // floods do not thrash main-thread rescheduling setTimeout (audit F15).
  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastIdleResetRef.current < IDLE_RESET_THROTTLE_MS) return;
    lastIdleResetRef.current = now;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      readLockStatus(userId)
        .then((lockStatus) => {
          if (lockStatus.hasPin) setState(lockedStateOf(lockStatus));
        })
        .catch(() => {
          /* IndexedDB недоступна — нічого блокувати */
        });
    }, IDLE_TIMEOUT_MS);
  }, [userId]);

  useEffect(() => {
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
  }, [resetIdleTimer]);

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
      const result = await verifyPinAttempt(pin, userId);
      if (result.ok) {
        setRetryAt(null);
        setState("idle");
        capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_SUCCESS, {
          method: "pin",
        });
        // Force-reset throttle window so resetIdleTimer runs immediately
        // to arm post-unlock idle timer (audit F15).
        lastIdleResetRef.current = 0;
        resetIdleTimer();
        return true;
      }
      setRetryAt(
        result.retryAfterMs > 0 ? Date.now() + result.retryAfterMs : null,
      );
      // sec-12/priv-14: вичерпаний ліміт НЕ знімає замок (раніше тут було
      // `setState("idle")` після стирання креденшела, і 10 хибних PIN
      // відкривали застосунок). Показуємо `lockedOut`: лишається тільки вихід.
      if (result.lockedOut) setState("lockedOut");
      // Відхилена без перевірки спроба (пауза / lockedOut) не є спробою
      // підбору, тож подію не шлемо: дашборди рахують лише реальні невдачі.
      if (!result.throttled) {
        capturePostHogEvent(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_FAILED, {
          method: "pin",
          attempt: result.failed,
          locked_out: result.lockedOut,
        });
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

  // sec-12/priv-14: єдиний шлях з `lockedOut` і дія «Забув PIN?». Креденшел
  // стираємо ЛИШЕ в межах підтвердженого виходу: якщо `logout()` скасовано
  // (діалог про незбережені записи), хук не викликається і замок лишається.
  // Стирання йде хуком `beforeNavigate` ВСЕРЕДИНІ `logout()`, а не після
  // нього: `logout()` завершується повним `location.assign`, який вивантажує
  // документ і переривав би IndexedDB-транзакцію, запущену вже після
  // повернення. Тоді запис із `failed >= 10` вцілів би, і повторний вхід
  // знову показав би `lockedOut` — вихід з якого знову не працює.
  const signOut = useCallback(async (): Promise<boolean> => {
    const signedOutUserId = userId;
    const done = await logout({
      beforeNavigate: async () => {
        await clearPinHash(signedOutUserId).catch(() => {
          /* best-effort: IndexedDB недоступна — креденшела й так не прочитати */
        });
        // L-11: без креденшела тумблер «PIN увімкнено» нічого не значить, тож
        // після виходу вимикаємо його, щоб наступний вхід не показував його
        // увімкненим.
        setFlag("app-lock-enabled", false);
      },
    });
    if (!done) return false;
    setRetryAt(null);
    setState("idle");
    return true;
  }, [logout, userId]);

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
    retryAt,
    signOut,
    isGuest: userId === null,
  };
}
