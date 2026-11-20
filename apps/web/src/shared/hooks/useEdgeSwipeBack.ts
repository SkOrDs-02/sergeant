/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Свайп «назад» від лівого краю екрана для детальних сторінок у
 * встановленому PWA.
 *
 * **Навіщо.** У Safari-вкладці жест «назад» дає сама система, а в
 * standalone-PWA на iOS його немає взагалі: детальна сторінка без шапки
 * модуля (підсумок завершеного тренування Фізрука) лишалась без звичного
 * виходу, і власник читав це як «свайп назад не працює» (фідбек
 * 2026-11-19).
 *
 * **Чому лише standalone.** У браузерній вкладці системний жест уже є, і
 * власний обробник поверх нього дав би подвійну навігацію. Тому поза
 * `isStandalonePWA()` гачок віддає no-op обробники.
 *
 * **Межі жесту.** Стартує лише в смузі `EDGE_SWIPE_ZONE_PX` від лівого
 * краю, комітиться на `EDGE_SWIPE_THRESHOLD_PX` горизонталі і лише коли рух
 * переважно горизонтальний: вертикальний скрол, що почався біля краю, не
 * повинен викидати зі сторінки.
 */
import { useRef, type TouchEvent } from "react";
import { isStandalonePWA } from "@shared/lib/platform/iosStandalone";

/** Ширина смуги біля лівого краю, з якої жест може початись. */
export const EDGE_SWIPE_ZONE_PX = 24;

/** Горизонтальний шлях, після якого жест комітить «назад». */
export const EDGE_SWIPE_THRESHOLD_PX = 72;

/** Вертикаль має бути помітно меншою за горизонталь, інакше це скрол. */
const MAX_VERTICAL_RATIO = 0.6;

export interface EdgeSwipeBackHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
  onTouchCancel: () => void;
}

export interface UseEdgeSwipeBackOptions {
  enabled?: boolean | undefined;
  /** Перевизначення для тестів; за замовчуванням `isStandalonePWA()`. */
  standalone?: boolean | undefined;
}

export function useEdgeSwipeBack(
  onBack: () => void,
  { enabled = true, standalone }: UseEdgeSwipeBackOptions = {},
): EdgeSwipeBackHandlers {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const active = enabled && (standalone ?? isStandalonePWA());

  return {
    onTouchStart: (e) => {
      startRef.current = null;
      if (!active || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_SWIPE_ZONE_PX) return;
      startRef.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dx >= EDGE_SWIPE_THRESHOLD_PX && dy < dx * MAX_VERTICAL_RATIO) {
        onBack();
      }
    },
    onTouchCancel: () => {
      startRef.current = null;
    },
  };
}
