import { useEffect, useId, useRef } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";

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
  const titleId = useId();
  const descriptionId = useId();
  const passwordId = useId();

  useDialogFocusTrap(open, panelRef, { onEscape: onCancel });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Закрити"
      />
      <div
        ref={panelRef}
        className="relative w-full max-w-sm bg-panel border border-line rounded-2xl shadow-soft p-5 z-10"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="text-base font-bold text-text">
          Видалити акаунт назавжди?
        </h2>
        <p id={descriptionId} className="text-sm text-muted mt-2">
          Введи пароль для підтвердження. Цю дію неможливо скасувати.
        </p>
        <div className="mt-4 space-y-2">
          <label
            htmlFor={passwordId}
            className="block text-xs font-medium text-muted"
          >
            Пароль
          </label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Ваш пароль"
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
