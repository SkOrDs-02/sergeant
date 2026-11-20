import { STORAGE_KEYS } from "@sergeant/shared";
import {
  safeReadStringLS,
  safeReadStringSS,
  safeWriteLS,
  safeWriteSS,
} from "@shared/lib/storage/storage";

/**
 * Лічильник сесій для запрошень встановлення: Chromium-банер у дзвонику
 * (`usePwaInstall`) і рядок для Safari на iPhone (О-1 (а), спека
 * `docs/work/specs/ios-install-hint-after-two-sessions.md`).
 *
 * Сесія це вкладка браузера чи запуск застосунку, а не завантаження
 * сторінки: перезавантаження тієї самої вкладки сесію не додає, бо
 * sessionStorage вкладки переживає reload і несе маркер
 * `PWA_SESSION_COUNTED`. До О-1 (а) лічильник ріс на кожному монтажі
 * `usePwaInstall`, тож два F5 поспіль уже давали «дві сесії».
 *
 * AI-NOTE: без sessionStorage (браузер його не дає) маркер не пишеться, і
 * лічба деградує до старої поведінки «кожне завантаження». Викликати можна з
 * кількох місць однієї сторінки: другий виклик бачить маркер і нічого не
 * робить. Кликати лише після `useStorageReady()`: до бутстрапу `kv_store`
 * читання бачить порожній сирий localStorage і перезаписало б лічильник.
 */

/** З якої сесії зʼявляються запрошення встановити застосунок. */
export const MIN_INSTALL_SESSIONS = 2;

/** Скільки сесій уже зараховано (0 для порожнього чи зіпсованого значення). */
export function readInstallSessionCount(): number {
  const parsed = Number.parseInt(
    safeReadStringLS(STORAGE_KEYS.PWA_SESSION_COUNT) ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Зарахувати поточну вкладку як сесію, якщо її ще не зараховано. Повертає
 * лічильник після виклику.
 */
export function countInstallSession(): number {
  if (safeReadStringSS(STORAGE_KEYS.PWA_SESSION_COUNTED) === "1") {
    return readInstallSessionCount();
  }
  const next = readInstallSessionCount() + 1;
  safeWriteLS(STORAGE_KEYS.PWA_SESSION_COUNT, String(next));
  safeWriteSS(STORAGE_KEYS.PWA_SESSION_COUNTED, "1");
  return next;
}
