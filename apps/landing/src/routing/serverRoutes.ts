import type { ComponentType } from "react";
import { ROUTE_PAGES, type RoutePath } from "./routes";

type PageModule = { default: ComponentType };

/**
 * Усі сторінки одразу: для SSG (`entry-server.tsx`) і тестів. Клієнт цей файл
 * не імпортує, інакше eager-glob повернув би всі сторінки в головний бандл.
 */
const PAGES = import.meta.glob<PageModule>("../pages/*Page.tsx", {
  eager: true,
});

export const ROUTES = Object.fromEntries(
  Object.entries(ROUTE_PAGES).map(([route, file]) => {
    const mod = PAGES[`../pages/${file}.tsx`];
    if (!mod) throw new Error(`serverRoutes: немає модуля ${file}`);
    return [route, mod.default];
  }),
) as Record<RoutePath, ComponentType>;
