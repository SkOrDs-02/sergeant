import { createContext, useContext } from "react";

/**
 * Маршрут поточної сторінки для навігації.
 *
 * Шапка і підвал позначають поточну сторінку `aria-current="page"`: до
 * 2026-10-08 її не позначало нічого, а кнопка черги на /beta вела сама на
 * себе без жодного сигналу (аудит сайту 2026-10-08, V14). `window` під час
 * пререндеру недоступний, тож маршрут приходить контекстом з обох шляхів
 * рендера: `App.tsx` у браузері і `entry-server.tsx` у білді.
 */
export const CurrentRouteContext = createContext<string>("/");

export function useCurrentRoute(): string {
  return useContext(CurrentRouteContext);
}
