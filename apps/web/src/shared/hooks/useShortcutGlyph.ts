import { useSyncExternalStore } from "react";

function detectIsApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  return (
    /Mac|iPhone|iPad|iPod/.test(platform) || /iPad|iPhone|iPod/.test(userAgent)
  );
}

/**
 * useShortcutGlyph
 *
 * Returns the platform-appropriate modifier glyph for keyboard shortcut
 * hints rendered in the UI — `⌘` on macOS / iPadOS, `Ctrl` everywhere
 * else. Convenience helper `withK()` appends `K` so callers can drop in
 * `Ctrl+K` / `⌘K` without duplicating the platform branch.
 *
 * Why a hook (and not a constant): we want to render the desktop /
 * Linux default on the SSR + first hydration pass (which sees no
 * `navigator`) and upgrade to `⌘` only after mount on a Mac. That
 * matches the rest of the app's user-agent gates (`useCoarsePointer`,
 * `useIosInstallBanner`) and keeps the keyboard-shortcut tooltip stable
 * across hydration boundaries.
 */
export function useShortcutGlyph(): {
  mod: string;
  modK: string;
  isApple: boolean;
} {
  const isApple = useSyncExternalStore(
    () => () => {},
    detectIsApple,
    () => false,
  );

  const mod = isApple ? "⌘" : "Ctrl";
  const modK = isApple ? "⌘K" : "Ctrl+K";
  return { mod, modK, isApple };
}
