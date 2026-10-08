import { useLayoutEffect, useRef, type MutableRefObject } from "react";

/**
 * Ref, що завжди тримає ОСТАННЄ значення `value` (оновлюється в layout-ефекті
 * після коміту, не під час рендера).
 *
 * AI-CONTEXT: для ефектів, які мають спрацювати лише на свій тригер, але
 * читають «свіжі» значення (дані, колбеки з нестабільною ідентичністю).
 * Замість приглушення правила exhaustive-deps читай `ref.current`
 * всередині ефекту — тоді ідентичність `value` не входить у deps і не
 * перезапускає ефект.
 *
 * Порядок: layout-ефект спрацьовує РАНІШЕ за звичайні `useEffect` того ж
 * коміту, тож ефект-споживач бачить значення поточного рендера.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
