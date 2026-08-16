import { useId, useRef } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useBodyScrollLock } from "@shared/hooks/useBodyScrollLock";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useKeyboardAwareOverlay } from "@shared/hooks/useKeyboardAwareOverlay";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { keyboardOverlayStyles } from "@shared/lib/ui/keyboardOverlay";

interface DeleteAccountDialogProps {
  open: boolean;
  password: string;
  deleting: boolean;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteAccountDialog({
  open,
  password,
  deleting,
  onPasswordChange,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const passwordId = useId();

  useDialogFocusTrap(open, panelRef, {
    onEscape: onCancel,
    inertBackground: true,
  });

  // Був hand-rolled `document.body.style.overflow = "hidden"`. Самого
  // `overflow: hidden` не досить на iOS Safari (visual viewport усе одно
  // rubber-band-ить сторінку під фіксованим оверлеєм), і він не має
  // refcount-у, тож вкладений оверлей затирав відновлення. Спільний хук
  // пінить body у `position: fixed` на поточному офсеті й рахує вкладеність.
  useBodyScrollLock(open);

  // Центрований діалог із полем пароля. Без keyboard-геометрії поле
  // опиняється під клавіатурою, і видимим його робив лише пан visual
  // viewport від iOS — а `useKeyboardAwareOverlay` цей пан гасить, тож
  // геометрія тут не «покращення», а умова коректності компенсації
  // (розбір — у шапці `keyboardOverlay.ts`).
  const kbInsetPx = useVisualKeyboardInset(open);
  const kbStyles = keyboardOverlayStyles(kbInsetPx);
  useKeyboardAwareOverlay(open, overlayRef);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-120 flex items-center justify-center p-4"
      style={kbStyles.container}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Закрити"
      />
      <div
        ref={panelRef}
        // `overflow-y-auto` — пара до `kbStyles.panel`: під клавіатурою
        // висота обрізається, і без власного скролу кнопки внизу стали б
        // недосяжними.
        className="relative w-full max-w-sm bg-panel border border-line rounded-2xl shadow-soft p-5 z-10 overflow-y-auto overscroll-contain"
        style={kbStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="text-style-title text-text">
          Видалити акаунт назавжди?
        </h2>
        <p id={descriptionId} className="text-style-body text-muted mt-2">
          Введи пароль для підтвердження. Цю дію неможливо скасувати.
        </p>
        <div className="mt-4 space-y-2">
          <label
            htmlFor={passwordId}
            className="block text-style-caption text-muted"
          >
            Пароль
          </label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
          />
        </div>
        <div className="flex gap-2 mt-5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onCancel}
          >
            Скасувати
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="md"
            className="flex-1"
            disabled={deleting || !password}
            loading={deleting}
            onClick={onConfirm}
          >
            Видалити
          </Button>
        </div>
      </div>
    </div>
  );
}
