import type { ReactNode } from "react";
import type { ToastApi } from "@shared/hooks/useToast";
import {
  UNDO_TOAST_DEFAULT_DURATION_MS,
  UNDO_TOAST_DEFAULT_ERROR_MSG,
  UNDO_TOAST_DEFAULT_LABEL,
} from "@sergeant/shared";
import { hapticError, hapticTap, hapticWarning } from "./haptic";

export interface UndoToastOptions {
  /** Текст, який бачить користувач ("Видалено звичку «Вода»"). */
  msg: ReactNode;
  /** Скільки мс тримати toast відкритим (default 5000, як і просив продакт-бриф). */
  duration?: number;
  /** Лейбл для кнопки undo ("Повернути"). */
  undoLabel?: string;
  /** Викликається, коли юзер натиснув undo — ти відновлюєш локальний state / БД. */
  onUndo: () => void;
  /**
   * Повідомлення, яке показується окремим error-toast-ом, якщо `onUndo` кидає
   * помилку. Без цього користувач раніше ніколи не дізнавався, що відновлення
   * не спрацювало — toast зникав без сліду і дані залишались видаленими.
   * Default: "Не вдалось повернути. Спробуй ще раз.".
   */
  onUndoErrorMsg?: ReactNode;
}

/**
 * Обгортка над `useToast().show`, що стандартизує patern для
 * деструктивних дій (видалення звички / транзакції / сета) під єдиний
 * 5-секундний таймер із undo-кнопкою.
 *
 * Виклик:
 * ```tsx
 * const toast = useToast();
 * showUndoToast(toast, {
 *   msg: "Видалено звичку «Вода»",
 *   onUndo: () => restoreHabit(habit),
 * });
 * ```
 *
 * Haptic: викликається `hapticWarning()` на появу toast, і `hapticTap()`
 * на натискання undo — щоб користувач фізично відчув і небезпечну дію,
 * і виправлення.
 *
 * Error handling: якщо `onUndo` кидає, показуємо error-toast замість
 * беззвучного ковтання винятку. Історично `catch {}` тут ховав реальні
 * помилки (наприклад, коли restore не міг поставити запис через квоту
 * localStorage) — юзер думав, що дані повернулись, а їх насправді не було.
 */
export function showUndoToast(
  toast: ToastApi,
  {
    msg,
    duration = UNDO_TOAST_DEFAULT_DURATION_MS,
    undoLabel = UNDO_TOAST_DEFAULT_LABEL,
    onUndo,
    onUndoErrorMsg = UNDO_TOAST_DEFAULT_ERROR_MSG,
  }: UndoToastOptions,
): number {
  hapticWarning();
  return toast.show(msg, "info", duration, {
    label: undoLabel,
    onClick: () => {
      hapticTap();
      try {
        onUndo();
      } catch {
        hapticError();
        toast.error(onUndoErrorMsg);
      }
    },
  });
}
