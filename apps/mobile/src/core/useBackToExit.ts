/**
 * `useBackToExit` — Android hardware-back parity hook for the Expo app.
 *
 * The Capacitor shell already ships a 2-tap-to-exit interaction
 * (`apps/mobile-shell/src/index.ts:435–465`, M20): the first hardware-
 * back at the root of the history stack only surfaces a hint toast,
 * and only the second back press within `BACK_TO_EXIT_WINDOW_MS`
 * actually exits. The Expo app had zero `BackHandler` references in
 * `apps/mobile/src` or `apps/mobile/app` (verified by `grep`), so a
 * single hardware back press on the hub screen was exiting the app
 * immediately on Android — confusing UX drift between the two
 * surfaces.
 *
 * This hook mounts a single `BackHandler` listener that mirrors the
 * shell's contract:
 *
 * 1. If the Expo Router can pop a screen (`router.canGoBack()`), pop
 *    it and consume the event — identical to RN's default but in our
 *    own control so step (2) can stay coherent.
 * 2. If we're at the root (`!router.canGoBack()`), the first back
 *    press shows a localised toast and arms the 2-second window. The
 *    second back press inside the window returns `false`, letting
 *    React Native's default handler call `BackHandler.exitApp()`. The
 *    window itself is held in a `useRef` so HMR-induced re-mounts
 *    can't wedge a stale "already armed" state across reloads.
 *
 * iOS has no hardware back button — `BackHandler.addEventListener`
 * resolves to a no-op listener registration there (the underlying
 * native module is Android-only) — but we still gate via
 * `Platform.OS === 'android'` to skip the work entirely.
 */

import { useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { useRouter } from "expo-router";

/**
 * Two-second double-tap window for the back-to-exit interaction. This
 * intentionally mirrors `apps/mobile-shell/src/index.ts`
 * (`BACK_TO_EXIT_WINDOW_MS = 2000`). When the two surfaces are
 * eventually consolidated, the constant should be lifted into
 * `@sergeant/shared`.
 */
export const BACK_TO_EXIT_WINDOW_MS = 2000;

/**
 * Localised "press back again to exit" string. Surfaced via Android's
 * native `ToastAndroid` so the hint feels system-native, doesn't
 * conflict with the React-Native `<Toast />` provider's z-index, and
 * remains visible during the 2 s window without re-rendering React.
 */
const BACK_TO_EXIT_HINT_UK = "Натисніть «Назад» ще раз, щоб вийти";

export function useBackToExit(): void {
  const router = useRouter();
  const lastBackAtRootRef = useRef<number>(0);

  useEffect(() => {
    // iOS doesn't have a hardware back button; the listener registers
    // a no-op but we still short-circuit for clarity. Web (Expo for
    // web debug) also doesn't have one, but `Platform.OS === 'web'`
    // would not be 'android' so it's caught by the same guard.
    if (Platform.OS !== "android") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) {
        router.back();
        lastBackAtRootRef.current = 0;
        return true;
      }

      const now = Date.now();
      const previous = lastBackAtRootRef.current;
      if (previous > 0 && now - previous <= BACK_TO_EXIT_WINDOW_MS) {
        // Second tap inside the window — clear the marker and let RN
        // perform the default exit (`BackHandler.exitApp()` via the
        // native bridge). Returning `false` is the contract; returning
        // `true` would suppress the exit.
        lastBackAtRootRef.current = 0;
        return false;
      }

      lastBackAtRootRef.current = now;
      try {
        ToastAndroid.show(BACK_TO_EXIT_HINT_UK, ToastAndroid.SHORT);
      } catch {
        // `ToastAndroid` should never throw, but if it does we don't
        // want to crash the navigator. Swallow silently — the next
        // back press will still exit.
      }
      return true;
    });

    return () => {
      sub.remove();
    };
  }, [router]);
}
