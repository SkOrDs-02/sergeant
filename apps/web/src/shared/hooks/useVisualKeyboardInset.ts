/**
 * Web adapter for the shared visual-keyboard-inset contract.
 *
 * Binds the `@sergeant/shared` contract to `window.visualViewport`:
 * the hook reports the gap between the layout viewport height and the
 * visual viewport height, which is how both iOS Safari and Android
 * Chrome surface the on-screen keyboard to web content. The 56 px
 * threshold filters out browser chrome resizes (URL bar auto-hide,
 * pinned toolbars) so we only lift bottom sheets when an actual
 * keyboard is present.
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

function readVisualKeyboardInsetPx(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const gap = window.innerHeight - vv.height;
  return gap > 56 ? Math.round(gap) : 0;
}

function subscribeVisualViewport(onStoreChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onStoreChange);
  return () => {
    vv.removeEventListener("resize", onStoreChange);
  };
}

function isTextEntryElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (el as HTMLElement).isContentEditable
  );
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
