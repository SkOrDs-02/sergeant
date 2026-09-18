/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Спільний outside-click dismiss. До витягання цей самий ефект був
 * скопійований у 9 місцях (Popover, Tooltip, DropdownMenu, FAB,
 * HubHeaderMenu, NotificationBell, HabitGlyphPicker, HabitHeatmap,
 * DailyPlanGoalSelectors) з дрібними варіаціями. Хук покриває всі
 * варіації опціями і навмисно НЕ обробляє Escape: Escape живе або в
 * useDialogFocusTrap, або в окремому keydown-ефекті поруч із focus-restore
 * на тригер — складати його сюди означало б міняти поведінку сайтів.
 *
 * AI-NOTE: mousedown (а не click) — навмисний дефолт: збігається з
 * контрактними тестами діалогових примітивів і не дає double-fire, коли
 * користувач відпускає кнопку миші над сусіднім елементом.
 */
import { useEffect, useRef, type RefObject } from "react";

export type OutsideClickEventName =
  "mousedown" | "pointerdown" | "click" | "touchstart";

export interface UseOutsideClickOptions {
  /** Коли false — ефект інертний (слухачі не вішаються). Дефолт true. */
  enabled?: boolean;
  /** Події, що вважаються «кліком». Дефолт ["mousedown"]. */
  events?: readonly OutsideClickEventName[];
  /** Слухати у capture-фазі (потрібно HabitHeatmap). Дефолт false. */
  capture?: boolean;
  /**
   * Що робити, коли ЖОДЕН ref ще не привʼязаний до DOM: true (дефолт) —
   * подія «зовні», onOutside спрацьовує; false — раннє виходимо без
   * виклику (історична семантика DailyPlanGoalSelectors).
   */
  closeOnNullRef?: boolean;
}

const DEFAULT_EVENTS: readonly OutsideClickEventName[] = ["mousedown"];

/**
 * Викликає `onOutside`, коли подія з `events` трапляється поза всіма
 * переданими ref-ами. `refs` може бути одним ref-ом або масивом; свіжий
 * літерал масиву на кожен рендер НЕ пере-вішує слухачі (refs читаються
 * через внутрішній ref).
 */
export function useOutsideClick(
  refs: RefObject<Node | null> | readonly RefObject<Node | null>[],
  onOutside: (event: Event) => void,
  options: UseOutsideClickOptions = {},
): void {
  const {
    enabled = true,
    events = DEFAULT_EVENTS,
    capture = false,
    closeOnNullRef = true,
  } = options;

  // Колбек і refs тримаємо в ref-ах, щоб inline-стрілки та свіжі масиви
  // не пере-бindʼювали document-слухачі на кожен рендер (той самий
  // патерн, що в useHistoryDismiss).
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });
  const refsRef = useRef(refs);
  useEffect(() => {
    refsRef.current = refs;
  });

  // Масив подій згортаємо в стабільний ключ, щоб дефолтний літерал у
  // call-site не тригерив ре-підписку.
  const eventsKey = events.join(",");

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const eventNames = eventsKey.split(",") as OutsideClickEventName[];
    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const current = refsRef.current;
      const list = Array.isArray(current)
        ? (current as readonly RefObject<Node | null>[])
        : [current as RefObject<Node | null>];
      let anyAttached = false;
      for (const ref of list) {
        const node = ref.current;
        if (!node) continue;
        anyAttached = true;
        if (node.contains(target)) return;
      }
      if (!anyAttached && !closeOnNullRef) return;
      onOutsideRef.current(event);
    };

    for (const name of eventNames) {
      document.addEventListener(name, handler, { capture });
    }
    return () => {
      for (const name of eventNames) {
        document.removeEventListener(name, handler, { capture });
      }
    };
  }, [enabled, capture, eventsKey, closeOnNullRef]);
}
