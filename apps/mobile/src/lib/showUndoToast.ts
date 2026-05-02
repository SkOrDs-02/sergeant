/**
 * Mobile mirror of `apps/web/src/shared/lib/undoToast.tsx`.
 *
 * Wraps `useToast().show` for destructive actions so the user gets a
 * single 5-second toast with an «Повернути» button instead of an
 * upfront confirm dialog or the legacy "tap-twice" pulse pattern.
 *
 * Why a port instead of sharing the web file:
 *  - Web's `ToastApi` action uses `onClick`; mobile's uses `onPress`
 *    (different React event surface — no DOM on mobile). The shape of
 *    the action object is therefore platform-specific, so we keep this
 *    helper next to the platform's `Toast` provider.
 *  - The haptic feedback contract (`hapticWarning` / `hapticTap` /
 *    `hapticError`) is the *same* on both platforms — it's exposed via
 *    `@sergeant/shared` and routed through the platform-specific
 *    adapter installed at app bootstrap. So this helper is otherwise
 *    behaviourally identical to the web one.
 *
 * Error handling: if `onUndo` throws (e.g., quota error from MMKV),
 * we emit `hapticError` and surface a separate error-toast instead of
 * silently swallowing the exception. Historically `catch {}` here hid
 * real failures — the user thought their data was back when in fact
 * the restore had failed.
 */

import type { ReactNode } from "react";

import { hapticError, hapticTap, hapticWarning } from "@sergeant/shared";

import type { ToastApi } from "@/components/ui/Toast";

export interface UndoToastOptions {
  /** Текст, який бачить користувач ("Видалено звичку «Вода»"). */
  msg: ReactNode;
  /** Скільки мс тримати toast відкритим (default 5000). */
  duration?: number;
  /** Лейбл для кнопки undo ("Повернути"). */
  undoLabel?: string;
  /** Викликається, коли юзер натиснув undo — ти відновлюєш локальний state. */
  onUndo: () => void;
  /**
   * Повідомлення, яке показується окремим error-toast-ом, якщо `onUndo`
   * кидає. Default: "Не вдалось повернути. Спробуй ще раз.".
   */
  onUndoErrorMsg?: ReactNode;
}

/**
 * Показати undo-toast. Повертає id toast-а (як `useToast().show`), щоб
 * викликаюча сторона могла programmatically dismiss-нути його.
 */
export function showUndoToast(
  toast: ToastApi,
  {
    msg,
    duration = 5000,
    undoLabel = "Повернути",
    onUndo,
    onUndoErrorMsg = "Не вдалось повернути. Спробуй ще раз.",
  }: UndoToastOptions,
): number {
  hapticWarning();
  return toast.show(msg, "info", duration, {
    label: undoLabel,
    onPress: () => {
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
