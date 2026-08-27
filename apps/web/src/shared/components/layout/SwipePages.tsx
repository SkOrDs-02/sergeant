/**
 * Last validated: 2026-08-18
 * Status: Active
 */
/**
 * SwipePages — горизонтальний свайп між вкладками модуля.
 *
 * До 2026-08-18 жест жив інлайном у `FinykApp` (гачок
 * `useSwipeNavigation` + локальний `getSwipeStyle`), і решта трьох
 * модулів його просто не мали: у Фізрука, Харчування й Рутини свайп не
 * «зламався» — його ніколи не підключали. Тому виправлення — не патч у
 * Фізруку, а один спільний компонент, крізь який ходять усі чотири
 * шелли.
 *
 * Що він дає понад голий гачок:
 *
 *  - **Палець тягне сторінку 1:1.** Мертву зону гачка
 *    (`SWIPE_DEAD_ZONE_PX`) віднімаємо, тож зсув росте з нуля, а не
 *    стрибає на 12 px у мить розпізнавання. За порогом коміту опір
 *    різко зростає (rubber-band) — видно, що далі тягнути нема куди.
 *  - **Спрямований вхід.** Нова сторінка не просто проявляється, а
 *    вʼїжджає з того боку, куди вів палець. Робиться transition-ом на
 *    тому самому `transform`, а не CSS-анімацією з `key`: `key` на
 *    обгортці ремаунтив би все піддерево (у Рутини й Харчування там
 *    один компонент на всі вкладки, а не чотири різні).
 *  - **Жест не ре-рендерить сторінку.** Стан drag-у живе тут, а вміст
 *    приходить пропом `children` — під час протягування React
 *    перемальовує лише цю обгортку, а не весь модуль, як було в
 *    `FinykApp` (там `setDragDx` на кожен `touchmove` тягнув за собою
 *    перерендер списку операцій).
 *
 * Смуга прогресу вгорі фарбується акцентом модуля
 * (`--module-accent-rgb`), тож окремої «фініківської» копії більше нема.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  SWIPE_DEAD_ZONE_PX,
  useSwipeNavigation,
} from "@shared/hooks/useSwipeNavigation";

/** Горизонтальний шлях (px), після якого свайп комітить перехід. */
export const SWIPE_THRESHOLD_PX = 60;

/** Стеля сирого зсуву, який віддає гачок. */
const DRAG_LIMIT_PX = 200;

/** Опір за порогом коміту: далі палець тягне сторінку вчетверо слабше. */
const OVERDRAG_RESISTANCE = 0.25;

/** З якого зсуву вʼїжджає нова сторінка. */
const ENTER_OFFSET_PX = 28;

/**
 * Сирий зсув пальця → видимий зсув сторінки. До порогу — 1:1 (мінус
 * мертва зона), далі — rubber-band.
 */
function dampen(rawDx: number): number {
  const travelled = Math.max(0, Math.abs(rawDx) - SWIPE_DEAD_ZONE_PX);
  const eased =
    travelled <= SWIPE_THRESHOLD_PX
      ? travelled
      : SWIPE_THRESHOLD_PX +
        (travelled - SWIPE_THRESHOLD_PX) * OVERDRAG_RESISTANCE;
  return rawDx < 0 ? -eased : eased;
}

export interface SwipePagesProps<Id extends string> {
  /** Вкладки в порядку показу — саме по ньому ходить свайп. */
  ids: readonly Id[];
  /**
   * Поточна сторінка. Якщо її нема в `ids` (детальний екран на кшталт
   * «Вправа» у Фізрука), жест вимикається сам — свайпати «наступну
   * вкладку» звідти не має сенсу.
   */
  activeId: Id;
  onChange: (next: Id) => void;
  /** Вимкнути жест (відкритий модал, шит тощо). */
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function SwipePages<Id extends string>({
  ids,
  activeId,
  onChange,
  enabled = true,
  className,
  children,
}: SwipePagesProps<Id>) {
  const index = ids.indexOf(activeId);
  const swipeable = enabled && index !== -1 && ids.length > 1;

  const step = (delta: 1 | -1) => {
    const next = ids[index + delta];
    if (next !== undefined) onChange(next);
  };

  const swipe = useSwipeNavigation({
    onSwipeLeft: () => step(1),
    onSwipeRight: () => step(-1),
    threshold: SWIPE_THRESHOLD_PX,
    dragLimit: DRAG_LIMIT_PX,
    enabled: swipeable,
    atStart: index <= 0,
    atEnd: index === ids.length - 1,
  });

  // Спрямований вʼїзд нової сторінки. `useLayoutEffect` ставить стартовий
  // зсув ДО першого кадру нової вкладки (інакше вона встигла б блимнути на
  // місці), а `requestAnimationFrame` наступним кадром відпускає його в
  // нуль уже з transition. Працює і для тапу по табу в нижній навігації —
  // напрямок беремо з різниці індексів, а не з того, що був жест.
  const previousIdRef = useRef(activeId);
  const [enterDx, setEnterDx] = useState(0);

  useLayoutEffect(() => {
    const previousId = previousIdRef.current;
    if (previousId === activeId) return;
    const previousIndex = ids.indexOf(previousId);
    previousIdRef.current = activeId;
    if (previousIndex === -1 || index === -1) return;
    setEnterDx(index > previousIndex ? ENTER_OFFSET_PX : -ENTER_OFFSET_PX);
    const raf = requestAnimationFrame(() => setEnterDx(0));
    return () => cancelAnimationFrame(raf);
  }, [activeId, ids, index]);

  const dragging = swipe.dragDx !== 0;
  const offset = dragging ? dampen(swipe.dragDx) : enterDx;

  // AI-CONTEXT: у стані спокою тут саме `transform: none`, а не
  // `translate3d(0,0,0)` — будь-який не-`none` transform робить елемент
  // containing block для `position: fixed` нащадків (CSS Transforms spec).
  // З identity-трансформом `fixed bottom-0` тулбар масового виділення
  // операцій пінився до цієї обгортки, а не до вьюпорта.
  const pageStyle: CSSProperties =
    offset !== 0
      ? {
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: "none",
          willChange: "transform",
          ...(dragging ? null : { opacity: 0.5 }),
        }
      : {
          transform: "none",
          transition:
            "transform var(--motion-duration-base) var(--motion-ease-emphasized), opacity var(--motion-duration-base) var(--motion-ease-emphasized)",
        };

  const committed = Math.abs(swipe.dragDx) >= SWIPE_THRESHOLD_PX;

  return (
    <div
      className={cn(
        "flex-1 overflow-hidden flex flex-col min-h-0 touch-pan-y relative",
        className,
      )}
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
    >
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 h-0.5 z-20 overflow-hidden"
        >
          <div
            className={cn(
              "h-full bg-[rgb(var(--module-accent-rgb))] transition-opacity duration-instant",
              committed ? "opacity-100" : "opacity-40",
            )}
            style={{
              width: `${Math.min(100, (Math.abs(swipe.dragDx) / SWIPE_THRESHOLD_PX) * 100)}%`,
              marginLeft: swipe.dragDx < 0 ? "auto" : 0,
            }}
          />
        </div>
      )}
      <div
        className="flex-1 overflow-hidden flex flex-col min-h-0"
        style={pageStyle}
      >
        {children}
      </div>
    </div>
  );
}
