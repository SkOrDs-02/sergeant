/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Діалог згоди перед незворотними chat-діями (канон `hub-coach` §8).
 *
 * AI-CONTEXT: копія навмисно **називає інструменти поіменно**, а не питає
 * абстрактне «Виконати дію?». Користувач тут погоджується на видалення або
 * перезапис, і згода без предмета — не згода. Мітки беремо з реєстру
 * здібностей, щоб діалог і каталог казали про одну дію тими самими словами.
 *
 * AI-NOTE: Раніше — bespoke overlay без focus trap / Escape / scroll lock.
 * Тепер тонка обгортка над `<ConfirmDialog>` (shared, C1 web-audit) —
 * canonical alertdialog з `useDialogFocusTrap` (inert background) +
 * `useBodyScrollLock`, той самий shell, що й `ConfirmDialog` скрізь у web.
 */
import { ASSISTANT_CAPABILITIES } from "@sergeant/shared";

import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { messages } from "@shared/i18n/uk";

const m = messages.hub.destructiveConfirm;

const LABEL_BY_ID = new Map(
  ASSISTANT_CAPABILITIES.map((c) => [c.id, c.label] as const),
);

export interface DestructiveConfirmModalProps {
  /** `null` — діалог закритий. */
  toolNames: readonly string[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DestructiveConfirmModal({
  toolNames,
  onConfirm,
  onCancel,
}: DestructiveConfirmModalProps) {
  const open = !!toolNames && toolNames.length > 0;

  return (
    <ConfirmDialog
      open={open}
      title={m.title}
      description={
        toolNames &&
        toolNames.length > 0 && (
          <>
            {m.body}
            <ul className="mt-2 space-y-1">
              {toolNames.map((name, i) => (
                <li
                  // Один і той самий інструмент може прийти в батчі двічі
                  // (наприклад, два видалення), тож ім'я не унікальне —
                  // ключ складений з індексом.
                  key={`${name}_${i}`}
                  className="text-style-body text-text"
                >
                  • {LABEL_BY_ID.get(name) ?? name}
                </li>
              ))}
            </ul>
          </>
        )
      }
      confirmLabel={m.confirm}
      cancelLabel={m.cancel}
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
