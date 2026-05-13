import { useEffect, useState } from "react";

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
 *
 * Detection uses both `navigator.userAgent` and `navigator.platform`
 * because Safari on iPad with Magic Keyboard reports
 * `platform = "MacIntel"` while Chromium / Firefox on Mac report
 * `platform = "MacIntel"` too — but Android tablets pretending to be
 * "Mac" via UA spoofing land in either bucket. The fall-back to "Ctrl"
 * is the conservative default: the OS-native binding on Linux /
 * Windows / Chrome OS / Android (when a hardware keyboard is attached)
 * is always Ctrl+<letter>.
 */
export function useShortcutGlyph(): {
  /** Modifier glyph: `"⌘"` on macOS / iPadOS, `"Ctrl"` elsewhere. */
  mod: string;
  /**
   * Convenience: `mod` + `K`. Renders `"⌘K"` on Mac (no separator,
   * matches the Apple HIG glyph convention) and `"Ctrl+K"` everywhere
   * else (with the `+` separator that Windows / Linux users expect).
   */
  modK: string;
  /**
   * `true` once the hook has detected macOS / iPadOS. Useful for
   * callers that need to swap longer copy strings, not just the glyph
   * (e.g. screen-reader descriptions).
   */
  isApple: boolean;
} {
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform = navigator.platform ?? "";
    const userAgent = navigator.userAgent ?? "";
    // Match the canonical mac / ipad gate used elsewhere in the app
    // (see `SearchResults` and `useIosInstallBanner`). `Mac` covers
    // Chromium / Firefox / Safari on macOS; `iPhone`/`iPad`/`iPod`
    // covers iOS Safari; the `userAgent` branch covers Chromium on
    // iPadOS which now reports as Mac+coarse-pointer.
    const apple =
      /Mac|iPhone|iPad|iPod/.test(platform) ||
      /iPad|iPhone|iPod/.test(userAgent);
    setIsApple(apple);
  }, []);

  const mod = isApple ? "⌘" : "Ctrl";
  const modK = isApple ? "⌘K" : "Ctrl+K";
  return { mod, modK, isApple };
}
