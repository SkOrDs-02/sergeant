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
 *
 * # Чому це ARM, а не глобальний слухач
 *
 * Спершу хук висів у `RootLayout` і скидав масштаб на КОЖНЕ повернення в
 * застосунок — перемкнув вкладку, згорнув-розгорнув, прийшов зі сну. Але
 * лікує він рівно один сценарій: повернення з нативної шторки камери.
 * Решта спрацювань — чистий побічний ефект, і найгірший з них у тому, що
 * свідомо зазумлена людиною сторінка розтискалась сама, коли вона
 * перемкнулась і повернулась. Для людини зі слабким зором це не дрібниця.
 *
 * Тому скидання тепер ОЗБРОЮЄТЬСЯ перед відкриттям камери і спрацьовує
 * рівно один раз — на найближчому поверненні. Викликай `armReset()` там,
 * де відкривається `<input type="file">`.
 */
import { useCallback, useEffect, useRef } from "react";

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

/**
 * @returns `armReset` — виклич його безпосередньо перед тим, як відкриється
 *   нативна шторка камери. Наступне повернення сторінки у видимий стан
 *   скине застряглий масштаб і роззброїть хук.
 */
export function useResetPinchZoomAfterCameraCapture(): () => void {
  const armed = useRef(false);

  useEffect(() => {
    const resetIfArmed = () => {
      if (!armed.current) return;
      // Роззброюємо ПЕРЕД скиданням: одне озброєння — рівно одне скидання,
      // навіть якщо `visibilitychange` і `pageshow` прийдуть обидва.
      armed.current = false;
      resetPinchZoom();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resetIfArmed();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", resetIfArmed);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", resetIfArmed);
    };
  }, []);

  return useCallback(() => {
    armed.current = true;
  }, []);
}
