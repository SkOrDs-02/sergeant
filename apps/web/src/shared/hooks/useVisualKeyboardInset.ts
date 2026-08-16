/**
 * Web adapter for the shared visual-keyboard-inset contract.
 *
 * Binds the `@sergeant/shared` contract to `window.visualViewport`:
 * the hook reports the gap between the layout viewport height and the
 * visual viewport height, which is how both iOS Safari and Android
 * Chrome surface the on-screen keyboard to web content. What counts as
 * a keyboard (gap threshold + focused text-entry element) lives in
 * `@shared/lib/platform/softKeyboard` — shared verbatim with
 * `useKeyboardAwareOverlay`, which must agree with this hook.
 *
 * Only `resize` is tracked — NOT `scroll`. iOS fires `scroll` on
 * `visualViewport` continuously while it pans the visual viewport to
 * keep a focused input above the keyboard, which shifts
 * `vv.offsetTop` on every frame. The inset used to subtract
 * `vv.offsetTop` from the gap and recompute on every such event, so
 * the reported inset jittered in lockstep with that pan — the sheet's
 * `marginBottom` visibly "jumped" under the user's finger and hit
 * targets moved mid-tap (spec `docs/90-work/planning/specs/keyboard-and-scroll.md`
 * § H1). The keyboard's on-screen height is stable for the whole time
 * it's open — only `resize` (the layout-viewport/visual-viewport
 * height delta actually changing) should ever move the reported inset.
 *
 * Importing this module has the side-effect of registering the web
 * adapter on the shared contract, so the side-effect import in
 * `apps/web/src/main.tsx` is all the app shell needs. Existing call
 * sites import the hook from `@sergeant/shared` — not from this file
 * — to stay platform-agnostic.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  setVisualKeyboardInsetAdapter,
  type VisualKeyboardInsetAdapter,
} from "@sergeant/shared";
// Визначення «клавіатура на екрані» спільне з `useKeyboardAwareOverlay`
// і живе в одному місці — `softKeyboardGapPx`. Розійтись їм не можна:
// інакше аркуш компенсує пан там, де інсету вже немає, або навпаки.
// Гепу самого по собі мало (браузерний chrome дає такий самий, і через
// це `HubBottomNav` ховався при холодному старті з пуша) — деталі
// предиката у шапці `softKeyboard.ts`.
import {
  isTextEntryElement,
  softKeyboardGapPx,
} from "@shared/lib/platform/softKeyboard";

function readVisualKeyboardInsetPx(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return softKeyboardGapPx(vv);
}

function subscribeVisualViewport(onStoreChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onStoreChange);
  // Знімок тепер залежить і від `document.activeElement` (див.
  // `readVisualKeyboardInsetPx`), тож фокус має бути таким самим джерелом
  // нотифікації, як і resize — інакше значення оновлювалось би лише тоді,
  // коли viewport випадково змінить розмір.
  document.addEventListener("focusin", onStoreChange);
  document.addEventListener("focusout", onStoreChange);
  return () => {
    vv.removeEventListener("resize", onStoreChange);
    document.removeEventListener("focusin", onStoreChange);
    document.removeEventListener("focusout", onStoreChange);
  };
}

/** Піднімає bottom sheet над віртуальною клавіатурою (iOS/Android Chrome). */
export const useWebVisualKeyboardInset: VisualKeyboardInsetAdapter = (
  active: boolean,
): number => {
  const insetPx = useSyncExternalStore(
    subscribeVisualViewport,
    readVisualKeyboardInsetPx,
    () => 0,
  );
  const reported = active ? insetPx : 0;

  // Fallback corrections for pages iOS doesn't handle on its own (spec
  // § H2/H3). These run once per open/close transition, not per pixel
  // of movement, so they can't reintroduce the H1 jitter.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    const isOpen = reported > 0;
    wasOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      // Keyboard just opened — make sure the focused field is actually
      // visible above it. Safe no-op when iOS already scrolled it into
      // view; only acts on the field the user is actively typing into.
      if (isTextEntryElement(document.activeElement)) {
        document.activeElement.scrollIntoView({ block: "nearest" });
      }
    } else if (!isOpen && wasOpen) {
      // Keyboard just closed. This app never intentionally scrolls
      // `window` itself (every screen is a fixed-height shell with its
      // own inner `overflow-y-auto` regions), so any non-zero
      // `window.scrollY` here is iOS's auto-scroll-to-focused-input
      // left over from the keyboard session — snap it back.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    }
  }, [reported]);

  return reported;
};

setVisualKeyboardInsetAdapter(useWebVisualKeyboardInset);
