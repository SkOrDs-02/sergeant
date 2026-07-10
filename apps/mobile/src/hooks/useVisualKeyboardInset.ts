/**
 * Mobile adapter for the shared visual-keyboard-inset contract.
 *
 * Binds the `@sergeant/shared` contract to React Native's `Keyboard`
 * module: the hook subscribes to `keyboardDidShow` /
 * `keyboardDidHide` and reports the reported keyboard height (dp) so
 * bottom sheets can lift themselves above the on-screen keyboard
 * without depending on `react-native-keyboard-controller` or
 * `react-native-reanimated`.
 *
 * When `active` is `false` the hook short-circuits to 0 and skips
 * wiring up listeners — this mirrors the web adapter and keeps
 * unnecessary listeners off the `Keyboard` module while sheets are
 * closed.
 *
 * Importing this module has the side-effect of registering the mobile
 * adapter on the shared contract. Do this once from
 * `app/_layout.tsx`, next to the haptic / file-download adapters.
 */

import { useEffect, useState } from "react";
import { Keyboard, type KeyboardEvent } from "react-native";

import {
  setVisualKeyboardInsetAdapter,
  type VisualKeyboardInsetAdapter,
} from "@sergeant/shared";

export const useMobileVisualKeyboardInset: VisualKeyboardInsetAdapter = (
  active: boolean,
): number => {
  const [insetPx, setInsetPx] = useState<number>(0);

  // When `active` is false, skip listener wiring and return 0 directly
  // (render-time derivation avoids `react-hooks/set-state-in-effect`,
  // initiative 0021).
  useEffect(() => {
    if (!active) return;
    const showSub = Keyboard.addListener(
      "keyboardDidShow",
      (event: KeyboardEvent) => {
        setInsetPx(event.endCoordinates.height);
      },
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setInsetPx(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [active]);

  return active ? insetPx : 0;
};

setVisualKeyboardInsetAdapter(useMobileVisualKeyboardInset);
