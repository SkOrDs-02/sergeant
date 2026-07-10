/**
 * Web adapter for the shared visual-keyboard-inset contract.
 *
 * Binds the `@sergeant/shared` contract to `window.visualViewport`:
 * the hook subscribes to `resize` + `scroll` and reports the gap
 * between the layout viewport height and the visual viewport bottom,
 * which is how both iOS Safari and Android Chrome surface the
 * on-screen keyboard to web content. The 56 px threshold filters out
 * browser chrome resizes (URL bar auto-hide, pinned toolbars) so we
 * only lift bottom sheets when an actual keyboard is present.
 *
 * Importing this module has the side-effect of registering the web
 * adapter on the shared contract, so the side-effect import in
 * `apps/web/src/main.tsx` is all the app shell needs. Existing call
 * sites import the hook from `@sergeant/shared` — not from this file
 * — to stay platform-agnostic.
 */

import { useSyncExternalStore } from "react";

import {
  setVisualKeyboardInsetAdapter,
  type VisualKeyboardInsetAdapter,
} from "@sergeant/shared";

function readVisualKeyboardInsetPx(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const gap = window.innerHeight - vv.height - vv.offsetTop;
  return gap > 56 ? Math.round(gap) : 0;
}

function subscribeVisualViewport(onStoreChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onStoreChange);
  vv.addEventListener("scroll", onStoreChange);
  return () => {
    vv.removeEventListener("resize", onStoreChange);
    vv.removeEventListener("scroll", onStoreChange);
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

  return active ? insetPx : 0;
};

setVisualKeyboardInsetAdapter(useWebVisualKeyboardInset);
