/**
 * Runtime-детектор Capacitor-оточення (shell-side).
 *
 * Експортує тільки `isCapacitor()` — shell-side перевірку через реальний
 * Capacitor SDK (потрібна всередині `apps/mobile-shell`, де `@capacitor/core`
 * вже є compile-time залежністю).
 *
 * Для браузерного коду (`apps/web`) використовуй `isCapacitor()` /
 * `getPlatform()` з `@sergeant/shared` — вони feature-detect-ять
 * `window.Capacitor` без compile-time залежності на `@capacitor/core`,
 * тож web-bundle лишається чистим для браузерного деплою.
 */

import { Capacitor } from "@capacitor/core";

export function isCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}
