import { useEffect, useRef, useState } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { Button } from "@shared/components/ui/Button";
import { coreMessages as messages } from "@shared/i18n/uk.core";
import { privacyMessages } from "@shared/i18n/uk.privacy";
import { type LockState } from "./useAppLock";

const m = privacyMessages.lock;

// PIN length constraints
const PIN_MIN = 4;
const PIN_MAX = 6;

interface PinPadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  error?: string;
  focusOnMount?: boolean;
  /** Пауза між спробами (sec-12): ввід вимкнено, доки вона триває. */
  disabled?: boolean;
}

function PinDisplay({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex gap-3 justify-center my-4" aria-hidden>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-mark border-2 transition-colors ${
            i < filled ? "bg-text border-text" : "bg-transparent border-line"
          }`}
        />
      ))}
    </div>
  );
}

function PinPad({
  value,
  onChange,
  maxLength,
  error,
  focusOnMount,
  disabled,
}: PinPadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Hidden numeric input — used on desktop / non-touch */}
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, maxLength);
          onChange(digits);
        }}
        aria-label="PIN"
        className="sr-only"
      />

      <PinDisplay length={maxLength} filled={value.length} />

      {/* On-screen numpad (primary on mobile) */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
          (key) => {
            if (key === "") {
              return <div key="spacer" aria-hidden />;
            }
            const isBackspace = key === "⌫";
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-label={isBackspace ? m.deleteDigit : key}
                className="w-16 h-16 rounded-lg bg-panel border border-line text-style-title text-text hover:bg-panelHi transition-colors select-none disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => {
                  if (isBackspace) {
                    onChange(value.slice(0, -1));
                  } else if (value.length < maxLength) {
                    onChange(value + key);
                  }
                }}
              >
                {key}
              </button>
            );
          },
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="text-style-body text-danger-strong dark:text-danger text-center mt-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Setup / Change flow (two-step: enter then confirm) ------------------

interface PinSetupFlowProps {
  onDone: () => void;
  onCancel: () => void;
  /** Persist the confirmed PIN — bound to the current user (audit F16). */
  onSave: (pin: string) => Promise<void>;
}

function PinSetupFlow({ onDone, onCancel, onSave }: PinSetupFlowProps) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");

  const handleFirstNext = () => {
    if (first.length < PIN_MIN) {
      setError(m.pinTooShort);
      return;
    }
    setError("");
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (second !== first) {
      setError(m.pinMismatch);
      setSecond("");
      return;
    }
    await onSave(first);
    onDone();
  };

  if (step === "enter") {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <p className="text-style-body text-muted">{m.setupSubtitle}</p>
        <PinPad
          value={first}
          onChange={setFirst}
          maxLength={PIN_MAX}
          error={error}
          focusOnMount
        />
        <Button
          variant="solid"
          size="md"
          className="w-full mt-2"
          disabled={first.length < PIN_MIN}
          onClick={handleFirstNext}
        >
          {m.next}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {messages.actions.cancel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <p className="text-style-body text-muted">{m.confirmSubtitle}</p>
      <PinPad
        value={second}
        onChange={setSecond}
        maxLength={PIN_MAX}
        error={error}
        focusOnMount
      />
      <Button
        variant="solid"
        size="md"
        className="w-full mt-2"
        disabled={second.length < PIN_MIN}
        onClick={handleConfirm}
      >
        {messages.actions.confirm}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setStep("enter");
          setSecond("");
          setError("");
        }}
      >
        {m.back}
      </Button>
      {/* Audit finding L-6/#5: the confirm step used to have no touch
          route out — "Confirm" or "Back" only, so a user two taps into
          setup/change had to go Back-then-Cancel, or reach for Escape
          (keyboard-only, unavailable on touch). */}
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {messages.actions.cancel}
      </Button>
    </div>
  );
}

// ---- Sign-out from the lock screen (sec-12 / priv-14) --------------------

/** «м:сс» – без плюралізації, щоб тікати щосекунди без стрибків ширини. */
function formatMmSs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Скільки мс лишилось до `retryAt`; тікає раз на секунду, поки пауза триває. */
function useRetryRemaining(retryAt: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= retryAt) clearInterval(id);
    };
    const id = setInterval(tick, 1000);
    // Одразу синхронізуємо `now` (початкове значення могло застаріти до
    // появи `retryAt`), але з таймера, а не синхронно в ефекті.
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [retryAt]);
  return retryAt ? Math.max(retryAt - now, 0) : 0;
}

interface SignOutActionProps {
  onSignOut: () => Promise<boolean>;
  variant: "solid" | "ghost";
  label: string;
  className?: string;
}

/** Кнопка виходу з busy-станом і помилкою. `false` від onSignOut = скасовано. */
function SignOutAction({
  onSignOut,
  variant,
  label,
  className,
}: SignOutActionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setBusy(true);
    setError("");
    try {
      await onSignOut();
    } catch {
      setError(m.signOutFailed);
    }
    setBusy(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size={variant === "solid" ? "md" : "sm"}
        className={className}
        disabled={busy}
        onClick={handleClick}
      >
        {busy ? m.signingOut : label}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-style-body text-danger-strong dark:text-danger text-center"
        >
          {error}
        </p>
      )}
    </>
  );
}

// ---- Unlock screen -------------------------------------------------------

interface UnlockScreenProps {
  onUnlock: (pin: string) => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  retryAt?: number | null | undefined;
  isGuest?: boolean | undefined;
}

function UnlockScreen({
  onUnlock,
  onSignOut,
  retryAt,
  isGuest,
}: UnlockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const remainingMs = useRetryRemaining(retryAt);
  const waiting = remainingMs > 0;

  // Синхронний замок поверх `busy`: стан React оновлюється асинхронно, а
  // шоста цифра викликає submit автоматично, тож без ref-а друга спроба
  // встигала стартувати, поки перша ще рахує PBKDF2 (sec-12/priv-14).
  const inFlightRef = useRef(false);

  const handleSubmit = async (candidate: string) => {
    if (inFlightRef.current || waiting || candidate.length < PIN_MIN) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const ok = await onUnlock(candidate);
      if (!ok) {
        setError(m.pinWrong);
        setPin("");
      }
    } catch {
      // Лічильник не вдалося записати (IDB) – спробу не зараховано як успіх.
      setError(m.pinWrong);
      setPin("");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const handlePinChange = (v: string) => {
    // Поки перевірка триває, ввід ігноруємо: інакше можна підмінити останню
    // цифру й надіслати нову спробу, не дочекавшись результату попередньої.
    if (inFlightRef.current) return;
    setPin(v);
    setError("");
    if (v.length === PIN_MAX) {
      handleSubmit(v);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <PinPad
        value={pin}
        onChange={handlePinChange}
        maxLength={PIN_MAX}
        error={error}
        focusOnMount
        disabled={waiting}
      />
      {waiting && (
        // Без role="alert"/live-регіону: оновлення щосекунди засмітило б
        // скрінрідер. Перше повідомлення про хибний PIN вже озвучене вище.
        <p
          className="text-style-body text-danger-strong dark:text-danger text-center"
          data-testid="app-lock-retry"
        >
          {m.retryIn.replace("{time}", formatMmSs(remainingMs))}
        </p>
      )}
      <Button
        variant="solid"
        size="md"
        className="w-full mt-2"
        disabled={pin.length < PIN_MIN || busy || waiting}
        onClick={() => handleSubmit(pin)}
      >
        {m.open}
      </Button>
      <SignOutAction
        onSignOut={onSignOut}
        variant="ghost"
        label={isGuest ? m.guestResetHint : m.recoveryHint}
        className="mt-2 h-auto whitespace-normal text-center"
      />
    </div>
  );
}

// ---- Locked-out screen: 10 хибних PIN, лишається тільки вихід -------------

function LockedOutScreen({
  onSignOut,
  isGuest,
}: {
  onSignOut: () => Promise<boolean>;
  isGuest?: boolean | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-style-body text-muted text-center">
        {isGuest ? m.guestLockedOutBody : m.lockedOutBody}
      </p>
      <SignOutAction
        onSignOut={onSignOut}
        variant="solid"
        label={isGuest ? m.guestReset : m.signOut}
        className="w-full"
      />
    </div>
  );
}

// ---- Top-level overlay ---------------------------------------------------

export interface AppLockProps {
  state: LockState;
  onUnlock: (pin: string) => Promise<boolean>;
  onSetupDone: () => void;
  /** Cancel the initial (lock-not-yet-enabled) setup flow. */
  onSetupCancel: () => void;
  /**
   * Cancel the "change PIN" flow. MUST be a distinct handler from
   * `onSetupCancel` (audit L-6): the old PIN is still valid in storage and
   * the lock is already enabled, so cancelling a change is just "close the
   * dialog" — routing it through `onSetupCancel` used to also disable the
   * lock, leaving the user thinking nothing changed while protection had
   * actually turned off.
   */
  onChangeCancel: () => void;
  /** Persist a new PIN, scoped to the current user (audit F16). */
  onSavePin: (pin: string) => Promise<void>;
  /**
   * Вихід з акаунта з екрана замка: дія «Забув PIN?» і єдиний вихід зі
   * стану `lockedOut` (sec-12/priv-14). `false` – вихід скасовано.
   */
  onSignOut: () => Promise<boolean>;
  /** Epoch ms завершення паузи між спробами PIN; `null` – паузи нема. */
  retryAt?: number | null | undefined;
  /** Гість без акаунта: «вихід» стирає локальні дані, тому інший текст. */
  isGuest?: boolean | undefined;
}

export function AppLock({
  state,
  onUnlock,
  onSetupDone,
  onSetupCancel,
  onChangeCancel,
  onSavePin,
  onSignOut,
  retryAt,
  isGuest,
}: AppLockProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const visible =
    state === "locked" ||
    state === "lockedOut" ||
    state === "setup" ||
    state === "change";
  // "change" і "setup" скасовуються по-різному (audit L-6) — change лишає
  // блокування увімкненим і стару PIN недоторканою, setup-скасування вимикає
  // блокування, бо його ще не було. Обираємо правильний handler один раз.
  const cancelHandler = state === "change" ? onChangeCancel : onSetupCancel;

  // ESC intentionally disabled on locked / lockedOut — user cannot bypass
  // with keyboard.
  useDialogFocusTrap(visible, panelRef, {
    onEscape:
      state === "locked" || state === "lockedOut" ? undefined : cancelHandler,
    inertBackground: true,
  });

  // AI-NOTE: оверлей замка на `z-300`, а не `z-modal` (200): глобальний
  // пошук (`HubSearch`, `z-200`) і діалоги з подієвої шини стоять на 200 і
  // йдуть пізніше в DOM, тож на рівних перекривали екран PIN (sec-13).
  // Гарячі клавіші під замком вимикає `useHubKeyboardShortcuts({ disabled })`;
  // шар лише страхує від діалогу, відкритого не клавішею.

  // Холодний старт: креденшел ще перевіряється. Закриваємо екран
  // непрозорою завісою, щоб дані не блимнули до екрана PIN. Без діалогу й
  // фокус-пастки: це секунди-частки секунди, а не взаємодія.
  if (state === "checking") {
    return (
      <div
        className="fixed inset-0 z-300 bg-bg"
        role="status"
        aria-busy="true"
        data-testid="app-lock-checking"
      >
        <span className="sr-only">{m.checking}</span>
      </div>
    );
  }

  if (!visible) return null;

  const title =
    state === "locked"
      ? m.unlockTitle
      : state === "lockedOut"
        ? m.lockedOutTitle
        : state === "change"
          ? m.changeTitle
          : m.setupTitle;

  return (
    <div
      className="fixed inset-0 z-300 flex items-center justify-center p-6 bg-bg/95 motion-safe:animate-fade-in"
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-lock-title"
        className="w-full max-w-xs flex flex-col items-center gap-4"
      >
        <h2
          id="app-lock-title"
          className="text-style-title text-text text-center"
        >
          {title}
        </h2>

        {state === "locked" ? (
          <UnlockScreen
            onUnlock={onUnlock}
            onSignOut={onSignOut}
            retryAt={retryAt}
            isGuest={isGuest}
          />
        ) : state === "lockedOut" ? (
          <LockedOutScreen onSignOut={onSignOut} isGuest={isGuest} />
        ) : (
          <PinSetupFlow
            onDone={onSetupDone}
            onCancel={cancelHandler}
            onSave={onSavePin}
          />
        )}
      </div>
    </div>
  );
}
