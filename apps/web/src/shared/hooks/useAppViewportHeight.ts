import { useEffect } from "react";

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
export function useAppViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
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
    };

    sync();
    vv.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.documentElement.style.removeProperty("--app-dvh");
    };
  }, []);
}
