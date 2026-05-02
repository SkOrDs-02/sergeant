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

import { useEffect, useState } from "react";

import {
  setVisualKeyboardInsetAdapter,
  type VisualKeyboardInsetAdapter,
} from "@sergeant/shared";

/** Піднімає bottom sheet над віртуальною клавіатурою (iOS/Android Chrome). */
export const useWebVisualKeyboardInset: VisualKeyboardInsetAdapter = (
  active: boolean,
): number => {
  const [insetPx, setInsetPx] = useState<number>(0);

  useEffect(() => {
    if (!active) {
      setInsetPx(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const ih = window.innerHeight;
      const gap = ih - vv.height - vv.offsetTop;
      setInsetPx(gap > 56 ? Math.round(gap) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return insetPx;
};

setVisualKeyboardInsetAdapter(useWebVisualKeyboardInset);
