/**
 * iOS + standalone-PWA детекція (SSR-safe).
 *
 * Винесено зі спільного gate-а `core/app/useIosInstallBanner.ts`, щоб
 * переюзати у voice-стеку. Контекст: `webkitSpeechRecognition` ІСНУЄ у
 * standalone-PWA на iOS (іконка з домашнього екрана), але фактично НЕ
 * працює — `recognition.start()` мовчки не стартує, `onresult` не
 * приходить (WebKit bug 185448 / 215884). Тому voice-код мусить
 * розрізняти цей режим, а не вірити лише наявності об'єкта, інакше
 * `VoiceMicButton` показав би мертву кнопку.
 *
 * Усі функції захищені від SSR/первинної гідрації (`typeof window` /
 * `typeof navigator`) — викликай їх з `useEffect`, як решта UA-гейтів у
 * застосунку (`useShortcutGlyph`, `useCoarsePointer`, `useIosInstallBanner`).
 */

/** `true` на iPhone/iPad/iPod (включно з iPadOS 13+, що рапортує як MacIntel). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ рапортує `platform === "MacIntel"` із кількома тач-поінтами.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** `true` коли застосунок запущено як встановлений PWA (standalone display-mode). */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari не підтримує `display-mode: standalone` media-query й
    // експонує власний прапорець `navigator.standalone`.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * `true` лише у standalone-PWA на iOS — режим, де Web Speech API присутній,
 * але непрацездатний. У Safari-вкладці (не standalone) повертає `false`, бо
 * там Web Speech працює нормально.
 */
export function isIOSStandalonePWA(): boolean {
  return isIOS() && isStandalonePWA();
}
