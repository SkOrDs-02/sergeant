import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadStringSS, safeWriteSS } from "@shared/lib/storage/storage";

/**
 * Маркер візиту «підказку встановлення вже показано під тумблером
 * нагадувань» (О-1 (б), `IosInstallPushHint`). Рядок у дзвонику хаба
 * (О-1 (а), `core/app/useIosInstallHint.ts`) його читає, щоб не показувати
 * ту саму підказку вдруге за один візит. Візит = вкладка (sessionStorage).
 */
export function markIosInstallHintInlineShown(): void {
  safeWriteSS(STORAGE_KEYS.IOS_INSTALL_HINT_INLINE_SHOWN, "1");
}

export function wasIosInstallHintInlineShown(): boolean {
  return safeReadStringSS(STORAGE_KEYS.IOS_INSTALL_HINT_INLINE_SHOWN) === "1";
}
