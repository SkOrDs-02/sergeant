import { useEffect, useRef, useState } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { type LockState } from "./useAppLock";
import { savePinHash } from "./lockStorage";

const m = messages.privacy.lock;

// PIN length constraints
const PIN_MIN = 4;
const PIN_MAX = 6;

interface PinPadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  error?: string;
  focusOnMount?: boolean;
}

function PinDisplay({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex gap-3 justify-center my-4" aria-hidden>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full border-2 transition-colors ${
            i < filled ? "bg-brand border-brand" : "bg-transparent border-line"
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
                aria-label={isBackspace ? m.deleteDigit : key}
                className="w-16 h-16 rounded-full bg-panel border border-line text-style-title text-text hover:bg-panelHi active:scale-95 transition-all select-none"
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
        <p role="alert" className="text-sm text-danger text-center mt-2">
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
}

function PinSetupFlow({ onDone, onCancel }: PinSetupFlowProps) {
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
    await savePinHash(first);
    onDone();
  };

  if (step === "enter") {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <p className="text-sm text-muted">{m.setupSubtitle}</p>
        <PinPad
          value={first}
          onChange={setFirst}
          maxLength={PIN_MAX}
          error={error}
          focusOnMount
        />
        <Button
          variant="primary"
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
      <p className="text-sm text-muted">{m.confirmSubtitle}</p>
      <PinPad
        value={second}
        onChange={setSecond}
        maxLength={PIN_MAX}
        error={error}
        focusOnMount
      />
      <Button
        variant="primary"
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
    </div>
  );
}

// ---- Unlock screen -------------------------------------------------------

interface UnlockScreenProps {
  onUnlock: (pin: string) => Promise<boolean>;
}

function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (candidate: string) => {
    if (candidate.length < PIN_MIN) return;
    setBusy(true);
    const ok = await onUnlock(candidate);
    if (!ok) {
      setError(m.pinWrong);
      setPin("");
    }
    setBusy(false);
  };

  const handlePinChange = (v: string) => {
    setPin(v);
    setError("");
    if (v.length === PIN_MAX) {
      handleSubmit(v);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <p className="text-sm text-muted">{m.unlockSubtitle}</p>
      <PinPad
        value={pin}
        onChange={handlePinChange}
        maxLength={PIN_MAX}
        error={error}
        focusOnMount
      />
      <Button
        variant="primary"
        size="md"
        className="w-full mt-2"
        disabled={pin.length < PIN_MIN || busy}
        onClick={() => handleSubmit(pin)}
      >
        {m.open}
      </Button>
      <p className="text-xs text-subtle text-center mt-2">{m.recoveryHint}</p>
    </div>
  );
}

// ---- Top-level overlay ---------------------------------------------------

export interface AppLockProps {
  state: LockState;
  onUnlock: (pin: string) => Promise<boolean>;
  onSetupDone: () => void;
  onSetupCancel: () => void;
}

export function AppLock({
  state,
  onUnlock,
  onSetupDone,
  onSetupCancel,
}: AppLockProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const visible = state === "locked" || state === "setup" || state === "change";

  // ESC intentionally disabled on locked — user cannot bypass with keyboard.
  useDialogFocusTrap(visible, panelRef, {
    onEscape: state === "locked" ? undefined : onSetupCancel,
  });

  if (!visible) return null;

  const title =
    state === "locked"
      ? m.unlockTitle
      : state === "change"
        ? m.changeTitle
        : m.setupTitle;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-bg/95 backdrop-blur-md motion-safe:animate-fade-in"
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-lock-title"
        className="w-full max-w-xs flex flex-col items-center gap-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-2">
          <Icon name="lock" size={28} className="text-brand" />
        </div>

        <h2
          id="app-lock-title"
          className="text-style-title text-text text-center"
        >
          {title}
        </h2>

        {state === "locked" ? (
          <UnlockScreen onUnlock={onUnlock} />
        ) : (
          <PinSetupFlow onDone={onSetupDone} onCancel={onSetupCancel} />
        )}
      </div>
    </div>
  );
}
