/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Діалог згоди перед незворотними chat-діями (канон `hub-coach` §8).
 *
 * AI-CONTEXT: копія навмисно **називає інструменти поіменно**, а не питає
 * абстрактне «Виконати дію?». Користувач тут погоджується на видалення або
 * перезапис, і згода без предмета — не згода. Мітки беремо з реєстру
 * здібностей, щоб діалог і каталог казали про одну дію тими самими словами.
 */
import { ASSISTANT_CAPABILITIES } from "@sergeant/shared";

import { Button } from "@shared/components/ui/Button";
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
  if (!toolNames || toolNames.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        role="presentation"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="destructive-confirm-title"
        className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-4 shadow-xl"
      >
        <h2
          id="destructive-confirm-title"
          className="text-style-label-lg text-text"
        >
          {m.title}
        </h2>
        <p className="mt-1 text-style-caption text-subtle leading-relaxed">
          {m.body}
        </p>
        <ul className="mt-3 space-y-1">
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
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {m.cancel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger-strong"
            onClick={onConfirm}
          >
            {m.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
