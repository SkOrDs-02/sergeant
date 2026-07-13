import { useCallback, useEffect } from "react";

/**
 * Keeps the `--app-dvh` CSS variable equal to the *actual* visible
 * viewport height.
 *
 * iOS Safari resolves `100dvh` lazily: after a page load, an SPA route
 * change or a toolbar collapse/expand the unit can keep a stale (smaller)
 * value until the next scroll gesture. The app shells are sized with
 * `100dvh`, so during that window a page-coloured strip appears below the
 * content AND hit-testing is offset — taps near the bottom edge land past
 * the buttons (round-3 UI audit: the welcome-screen strip that "carries
 * over" onto the hub, and the flaky «У мене є акаунт» CTA).
 * `visualViewport.height` is always fresh, so shells sized via
 * `var(--app-dvh, 100dvh)` (see `h-app-dvh` in utilities.css and
 * `html/body/#root` in base.css) track the real viewport instead.
 *
 * Resize events fired while an editable element is focused are skipped:
 * that resize is the on-screen keyboard, and shrinking the whole shell to
 * the keyboard-clipped viewport would jump the layout under the form.
 */
export function useAppViewportHeight(syncKey?: string): void {
  const sync = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const el = document.activeElement;
    const editing =
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable);
    if (editing) return;
    document.documentElement.style.setProperty(
      "--app-dvh",
      `${Math.round(vv.height)}px`,
    );
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    sync();
    vv.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.documentElement.style.removeProperty("--app-dvh");
    };
  }, [sync]);

  useEffect(() => {
    // iOS can settle the visual viewport one frame after an SPA route change
    // (especially when Safari's bottom toolbar is collapsing). Re-sync after
    // the route commit so the next shell uses the final hit-test geometry.
    // Keep the previous value in place until the new measurement is ready;
    // removing it here would briefly re-enable stale `100dvh` and repaint the
    // exact bottom strip this hook is meant to prevent.
    sync();
    const frame = window.requestAnimationFrame(sync);
    const settle = window.setTimeout(sync, 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [sync, syncKey]);
}
