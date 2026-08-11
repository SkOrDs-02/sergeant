/**
 * iOS Safari (and the iOS Capacitor WebView) can return from the native
 * camera sheet — triggered by `<input type="file" accept="image/*">`,
 * e.g. `PhotoAnalyzeCard`'s "Аналізувати фото" flow — with the page still
 * pinch-zoomed in. WebKit sometimes leaves the visual-viewport scale from
 * right before the camera opened applied to the returned page instead of
 * resetting it to 1. The result: the layout looks "поїхав" — content
 * clipped at the right edge, buttons half off-screen — even though every
 * DOM element and CSS rule is unchanged (`html`/`body`/`#root` are already
 * `overflow: hidden`, which does nothing here because pinch-zoom pans the
 * *visual* viewport, not the document).
 *
 * Fix: on `visibilitychange`/`pageshow` — both fire when the camera sheet
 * closes and the page becomes visible again — briefly force
 * `maximum-scale=1` onto the viewport meta tag and restore the original
 * value right after. Toggling the attribute is what makes WebKit actually
 * recompute and reset the stuck scale; setting `maximum-scale=1`
 * permanently would block intentional pinch-zoom everywhere else.
 */
import { useEffect } from "react";

const VIEWPORT_RESET_DELAY_MS = 50;

function resetPinchZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const original = meta?.getAttribute("content");
  if (!meta || !original) return;
  meta.setAttribute("content", `${original}, maximum-scale=1`);
  window.setTimeout(() => {
    meta.setAttribute("content", original);
  }, VIEWPORT_RESET_DELAY_MS);
}

export function useResetPinchZoomOnResume(): void {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resetPinchZoom();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", resetPinchZoom);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", resetPinchZoom);
    };
  }, []);
}
