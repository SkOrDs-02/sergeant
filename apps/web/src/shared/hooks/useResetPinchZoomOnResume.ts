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
 * Fix: arm the reset only when an image file input opens, then consume the
 * next `visibilitychange`/`pageshow` resume signal. Both resume events can
 * fire for one picker, so the reset is single-flight and always restores the
 * canonical pre-reset value. Ordinary app resumes stay untouched and
 * intentional pinch-zoom keeps working everywhere else.
 */
import { useEffect, useRef } from "react";

const VIEWPORT_RESET_DELAY_MS = 50;

export function useResetPinchZoomOnResume(): void {
  const pickerPendingRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const originalViewportRef = useRef<string | null>(null);
  const resetMetaRef = useRef<HTMLMetaElement | null>(null);

  useEffect(() => {
    const armForImagePicker = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "file" || !target.accept.includes("image/")) return;
      pickerPendingRef.current = true;
    };

    const resetPinchZoom = () => {
      if (!pickerPendingRef.current) return;
      pickerPendingRef.current = false;
      if (resetTimerRef.current !== null) return;

      const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="viewport"]',
      );
      const original = meta?.getAttribute("content");
      if (!meta || !original) return;

      originalViewportRef.current = original;
      resetMetaRef.current = meta;
      meta.setAttribute("content", `${original}, maximum-scale=1`);
      resetTimerRef.current = window.setTimeout(() => {
        meta.setAttribute("content", original);
        resetTimerRef.current = null;
        originalViewportRef.current = null;
        resetMetaRef.current = null;
      }, VIEWPORT_RESET_DELAY_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resetPinchZoom();
    };
    document.addEventListener("click", armForImagePicker, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", resetPinchZoom);
    return () => {
      document.removeEventListener("click", armForImagePicker, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", resetPinchZoom);
      pickerPendingRef.current = false;
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      if (resetMetaRef.current && originalViewportRef.current) {
        resetMetaRef.current.setAttribute(
          "content",
          originalViewportRef.current,
        );
      }
      originalViewportRef.current = null;
      resetMetaRef.current = null;
    };
  }, []);
}
